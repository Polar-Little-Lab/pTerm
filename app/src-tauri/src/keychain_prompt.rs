//! File-keychain prompt text is stored separately in ACL descriptions.
//! Preserve application lists, authorizations, prompt selectors and partition ACLs.
use core_foundation::{array::{CFArray,CFArrayRef},base::{CFType,CFTypeRef,TCFType},boolean::CFBoolean,dictionary::CFDictionary,string::{CFString,CFStringRef}};
use security_framework_sys::{item::{kSecClass,kSecClassGenericPassword,kSecAttrService,kSecAttrAccount,kSecReturnRef,kSecUseAuthenticationUI},keychain_item::{SecItemCopyMatching,SecItemUpdate}};
#[link(name="Security",kind="framework")]
unsafe extern "C" {
 static kSecUseAuthenticationUIFail:CFStringRef;
 static kSecAttrAccess:CFStringRef;
 fn SecKeychainGetUserInteractionAllowed(allowed:*mut u8)->i32;
 fn SecKeychainSetUserInteractionAllowed(allowed:u8)->i32;
 fn SecKeychainItemCopyAccess(item:CFTypeRef,access:*mut CFTypeRef)->i32;
 fn SecAccessCopyACLList(access:CFTypeRef,list:*mut CFArrayRef)->i32;
 fn SecACLCopyContents(acl:CFTypeRef,apps:*mut CFArrayRef,description:*mut CFStringRef,prompt:*mut u16)->i32;
 fn SecACLSetContents(acl:CFTypeRef,apps:CFArrayRef,description:CFStringRef,prompt:u16)->i32;
}
fn string(p:CFStringRef)->CFType{unsafe{CFString::wrap_under_get_rule(p).as_CFType()}}
fn check(code:i32)->Result<(),i32>{if code==0{Ok(())}else{Err(code)}}
fn identity(service:&str,account:&str)->Vec<(CFType,CFType)>{vec![
 (string(unsafe{kSecClass}),string(unsafe{kSecClassGenericPassword})),
 (string(unsafe{kSecAttrService}),CFString::new(service).as_CFType()),
 (string(unsafe{kSecAttrAccount}),CFString::new(account).as_CFType()),
 (string(unsafe{kSecUseAuthenticationUI}),string(unsafe{kSecUseAuthenticationUIFail})),
]}
fn access(service:&str,account:&str)->Result<CFType,i32>{
 let mut pairs=identity(service,account);pairs.push((string(unsafe{kSecReturnRef}),CFBoolean::true_value().as_CFType()));
 let query=CFDictionary::from_CFType_pairs(&pairs);let mut item=std::ptr::null();
 check(unsafe{SecItemCopyMatching(query.as_concrete_TypeRef(),&mut item)})?;
 if item.is_null(){return Err(-50);}
 let item=unsafe{CFType::wrap_under_create_rule(item)};let mut access=std::ptr::null();
 check(unsafe{SecKeychainItemCopyAccess(item.as_CFTypeRef(),&mut access)})?;
 if access.is_null(){return Err(-50);}
 Ok(unsafe{CFType::wrap_under_create_rule(access)})
}
fn entries(access:&CFType)->Result<CFArray<CFType>,i32>{
 let mut list=std::ptr::null();check(unsafe{SecAccessCopyACLList(access.as_CFTypeRef(),&mut list)})?;
 if list.is_null(){return Err(-50);}
 Ok(unsafe{CFArray::wrap_under_create_rule(list)})
}
fn contents(acl:CFTypeRef)->Result<(Option<CFArray<CFType>>,Option<CFString>,u16),i32>{
 let(mut apps,mut description,mut prompt)=(std::ptr::null(),std::ptr::null(),0);
 check(unsafe{SecACLCopyContents(acl,&mut apps,&mut description,&mut prompt)})?;
 Ok((if apps.is_null(){None}else{Some(unsafe{CFArray::wrap_under_create_rule(apps)})},if description.is_null(){None}else{Some(unsafe{CFString::wrap_under_create_rule(description)})},prompt))
}
// Legacy ACL APIs may ignore the query UI option. Vault holds its key mutex
// across this operation, so other Vault keychain access cannot overlap it.
struct InteractionGuard(u8);
impl InteractionGuard {fn new()->Result<Self,i32>{let mut old=0;check(unsafe{SecKeychainGetUserInteractionAllowed(&mut old)})?;check(unsafe{SecKeychainSetUserInteractionAllowed(0)})?;Ok(Self(old))}}
impl Drop for InteractionGuard {fn drop(&mut self){unsafe{SecKeychainSetUserInteractionAllowed(self.0);}}}
/// No new authentication UI. Only exact legacy descriptions are changed.
pub fn update(service:&str,account:&str,legacy_description:&str,label:&str)->Result<usize,i32>{
 let _interaction=InteractionGuard::new()?;
 let access=access(service,account)?;let list=entries(&access)?;let label=CFString::new(label);let mut changed=0;
 for acl in list.get_all_values(){
  let(apps,description,prompt)=contents(acl)?;
  if description.as_ref().is_some_and(|d|d.to_string()==legacy_description || d.to_string()=="Polarsh — 호스트와 저장 명령"){
   check(unsafe{SecACLSetContents(acl,apps.as_ref().map_or(std::ptr::null(),|a|a.as_concrete_TypeRef()),label.as_concrete_TypeRef(),prompt)})?;
   changed+=1;
  }
 }
 if changed>0{
  let query=CFDictionary::from_CFType_pairs(&identity(service,account));
  let changes=CFDictionary::from_CFType_pairs(&[(string(unsafe{kSecAttrAccess}),access)]);
  check(unsafe{SecItemUpdate(query.as_concrete_TypeRef(),changes.as_concrete_TypeRef())})?;
 }
 Ok(changed)
}
#[cfg(test)]
pub fn snapshot(service:&str,account:&str)->Result<Vec<(String,u16,Option<isize>)>,i32>{
 let access=access(service,account)?;entries(&access)?.get_all_values().into_iter().map(|acl|{
  let(apps,description,prompt)=contents(acl)?;Ok((description.map(|d|d.to_string()).unwrap_or_default(),prompt,apps.map(|a|a.len())))
 }).collect()
}
