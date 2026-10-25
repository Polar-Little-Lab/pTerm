//! Branding migration: preserve secrets and ACLs; never overwrite another item.
use core_foundation::{base::{CFType,TCFType},data::CFData,dictionary::CFDictionary,string::{CFString,CFStringRef}};
use security_framework_sys::{item::{kSecClass,kSecClassGenericPassword,kSecAttrService,kSecAttrAccount,kSecAttrLabel,kSecUseAuthenticationUI,kSecValueData},keychain_item::{SecItemUpdate,SecItemAdd}};
#[link(name="Security",kind="framework")]
unsafe extern "C" {static kSecUseAuthenticationUIFail:CFStringRef;}
fn string(value:CFStringRef)->CFType{unsafe{CFString::wrap_under_get_rule(value).as_CFType()}}
fn identity(service:&str,account:&str)->Vec<(CFType,CFType)>{vec![
 (string(unsafe{kSecClass}),string(unsafe{kSecClassGenericPassword})),
 (string(unsafe{kSecAttrService}),CFString::new(service).as_CFType()),
 (string(unsafe{kSecAttrAccount}),CFString::new(account).as_CFType()),
 (string(unsafe{kSecUseAuthenticationUI}),string(unsafe{kSecUseAuthenticationUIFail})),
]}
fn rename_attributes(service:&str,label:&str)->CFDictionary<CFType,CFType>{CFDictionary::from_CFType_pairs(&[
 (string(unsafe{kSecAttrService}),CFString::new(service).as_CFType()),
 (string(unsafe{kSecAttrLabel}),CFString::new(label).as_CFType()),
])}
/// Best-effort, noninteractive in-place rename. Duplicate destinations are untouched.
pub fn rename(legacy:&str,current:&str,account:&str,label:&str)->Result<(),i32>{
 let query=CFDictionary::from_CFType_pairs(&identity(legacy,account));
 let status=unsafe{SecItemUpdate(query.as_concrete_TypeRef(),rename_attributes(current,label).as_concrete_TypeRef())};
 if status==0{Ok(())}else{Err(status)}
}
/// Add-only copy after decrypting the existing Vault. Never changes an existing key.
pub fn add_key(service:&str,account:&str,label:&str,key:&[u8])->Result<(),i32>{
 let mut pairs=identity(service,account);
 pairs.push((string(unsafe{kSecAttrLabel}),CFString::new(label).as_CFType()));
 pairs.push((string(unsafe{kSecValueData}),CFData::from_buffer(key).as_CFType()));
 let query=CFDictionary::from_CFType_pairs(&pairs);
 let status=unsafe{SecItemAdd(query.as_concrete_TypeRef(),std::ptr::null_mut())};
 if status==0{Ok(())}else{Err(status)}
}
/// Fall back only for a missing current item, never for denied/cancelled access.
pub fn read_current_or_legacy<T>(current:&str,legacy:&str,mut read:impl FnMut(&str)->Result<T,i32>)->Result<(T,bool),i32>{
 match read(current){Ok(key)=>Ok((key,false)),Err(-25300) if current!=legacy=>read(legacy).map(|key|(key,true)),Err(code)=>Err(code)}
}
pub fn service_names(identifier:&str)->(String,String){
 let legacy=format!("{identifier}.vault.v1");
 // Keep development/QA applications isolated from the production Vault.
 let current=if identifier=="dev.harbor.ssh"{"dev.polarsh.vault.v1".to_owned()}else{legacy.clone()};
 (current,legacy)
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test] fn rename_preserves_secret_and_account(){let changes=rename_attributes("dev.polarsh.vault.v1","Polarsh");assert_eq!(changes.len(),2);assert!(!changes.contains_key(&string(unsafe{kSecValueData})));assert!(!changes.contains_key(&string(unsafe{kSecAttrAccount})));}
 #[test] fn production_migrates_but_qa_stays_isolated(){assert_eq!(service_names("dev.harbor.ssh").0,"dev.polarsh.vault.v1");let(a,b)=service_names("dev.polarsh.qa");assert_eq!(a,b);}
 #[test] fn new_item_is_preferred_and_denials_never_fall_back(){for result in [Ok(42),Err(-128),Err(-25293),Err(-25308)]{let mut calls=0;let got=read_current_or_legacy("new","old",|_|{calls+=1;result});assert_eq!(calls,1);assert_eq!(got,result.map(|k|(k,false)));}}
 #[test] fn only_missing_item_reads_legacy_once(){let mut calls=vec![];let got=read_current_or_legacy("new","old",|s|{calls.push(s.to_owned());if s=="new"{Err(-25300)}else{Ok(42)}});assert_eq!(got,Ok((42,true)));assert_eq!(calls,["new","old"]);}
}

#[cfg(test)]
mod integration {
    use super::*;
    #[test]
    #[ignore = "Isolated temporary Keychain items; authentication UI is prohibited"]
    fn noninteractive_migration_preserves_key_and_does_not_overwrite() {
        let base=format!("dev.polarsh.migration-test.{}",uuid::Uuid::new_v4());
        let old=format!("{base}.old");let new=format!("{base}.new");
        struct Cleanup(Vec<String>);
        impl Drop for Cleanup {fn drop(&mut self){for service in &self.0{let q=CFDictionary::from_CFType_pairs(&identity(service,"test-only"));unsafe{security_framework_sys::keychain_item::SecItemDelete(q.as_concrete_TypeRef());}}}}
        let _cleanup=Cleanup(vec![old.clone(),new.clone()]);
        let read=|service:&str|{
            let mut pairs=identity(service,"test-only");
            pairs.push((string(unsafe{security_framework_sys::item::kSecReturnData}),core_foundation::boolean::CFBoolean::true_value().as_CFType()));
            let query=CFDictionary::from_CFType_pairs(&pairs);
            let mut result=std::ptr::null();
            let status=unsafe{security_framework_sys::keychain_item::SecItemCopyMatching(query.as_concrete_TypeRef(),&mut result)};
            if status!=0{return Err(status);}
            let data=unsafe{CFData::wrap_under_create_rule(result.cast())};
            Ok(data.bytes().to_vec())
        };
        add_key(&old,"test-only","Legacy test",&[35;32]).unwrap();
        rename(&old,&new,"test-only","Polarsh test").unwrap();
        assert_eq!(read(&old),Err(-25300));
        assert_eq!(read(&new).unwrap(),vec![35;32]);
        let before=crate::keychain_prompt::snapshot(&new,"test-only").unwrap();
        assert!(before.iter().any(|(text,_,_)|text=="Legacy test"||text==&old));
        for description in ["Legacy test",old.as_str()] {
            crate::keychain_prompt::update(&new,"test-only",description,"Polarsh test").unwrap();
        }
        let after=crate::keychain_prompt::snapshot(&new,"test-only").unwrap();
        assert_eq!(before.len(),after.len());
        for (a,b) in before.iter().zip(&after) {
            assert_eq!((a.1,a.2),(b.1,b.2),"prompt flags and trusted-app lists must be preserved");
            if a.0=="Legacy test"||a.0==old {assert_eq!(b.0,"Polarsh test");}else{assert_eq!(a.0,b.0,"partition/signing ACLs must be untouched");}
        }
        assert_eq!(crate::keychain_prompt::update(&new,"test-only",&old,"Polarsh test").unwrap(),0);
        assert_eq!(read(&new).unwrap(),vec![35;32]);
        // Both add-only fallback and in-place migration refuse collisions.
        assert_eq!(add_key(&new,"test-only","Other",&[99;32]),Err(-25299));
        add_key(&old,"test-only","Legacy test",&[88;32]).unwrap();
        assert_eq!(rename(&old,&new,"test-only","Polarsh test"),Err(-25299));
        assert_eq!(read(&new).unwrap(),vec![35;32]);
        assert_eq!(read(&old).unwrap(),vec![88;32]);
    }
}
