//! Structured native integrations. User data is passed as argv, never through a shell.
use portable_pty::CommandBuilder;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramRequest {
    pub mode: String,
    pub executable: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub identity: Option<String>,
    pub certificate: Option<String>,
    pub provider: Option<String>,
    pub gssapi: Option<bool>,
    pub agent_forwarding: Option<bool>,
    pub x11: Option<bool>,
    pub jump: Option<String>,
    pub config: Option<String>,
    pub script: Option<String>,
    pub args: Option<Vec<String>>,
    pub local_path: Option<String>,
    pub remote_path: Option<String>,
    pub upload: Option<bool>,
    pub tls: Option<bool>,
    pub cwd: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct ProgramPlan {
    pub executable: String,
    pub args: Vec<String>,
    pub title: String,
}
fn checked(value: &str) -> Result<&str, String> {
    if value.len() > 4096 || value.chars().any(|c| c == '\0' || c == '\n' || c == '\r') {
        Err("입력 값에 허용하지 않는 문자가 있습니다.".into())
    } else {
        Ok(value)
    }
}
fn host(r: &ProgramRequest) -> Result<&str, String> {
    let value = checked(r.host.as_deref().unwrap_or(""))?;
    if value.is_empty()
        || value.starts_with('-')
        || value
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '/' | '@' | '[' | ']'))
    {
        return Err("호스트 주소를 확인하세요.".into());
    }
    Ok(value)
}
fn absolute(value: &str) -> Result<&str, String> {
    checked(value)?;
    if !Path::new(value).is_absolute() {
        return Err("파일의 절대 경로를 입력하세요.".into());
    }
    Ok(value)
}
fn resolve(custom: Option<&str>, candidates: &[&str]) -> Result<String, String> {
    if let Some(p) = custom.filter(|s| !s.is_empty()) {
        absolute(p)?;
        if Path::new(p).is_file() {
            return Ok(p.into());
        }
        return Err("선택한 실행 파일이 없습니다.".into());
    }
    candidates
        .iter()
        .find(|p| Path::new(p).is_file())
        .map(|p| p.to_string())
        .ok_or_else(|| {
            format!(
                "실행 엔진이 설치되어 있지 않습니다. 실행 파일을 선택하세요: {}",
                candidates.join(", ")
            )
        })
}
fn ssh_path_option(key: &str, value: &str) -> Result<String, String> {
    absolute(value)?;
    Ok(format!(
        "{key}=\"{}\"",
        value.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}
fn jump(value: &str) -> Result<&str, String> {
    checked(value)?;
    if value.starts_with('-')
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-,:@[]%".contains(c))
    {
        return Err(
            "점프 호스트 형식은 user@host:port이며 쉼표로 여러 호스트를 구분합니다.".into(),
        );
    }
    Ok(value)
}
fn path_option(args: &mut Vec<String>, flag: &str, value: Option<&str>) -> Result<(), String> {
    if let Some(value) = value.filter(|v| !v.is_empty()) {
        absolute(value)?;
        args.extend([flag.into(), value.into()]);
    }
    Ok(())
}
fn encoded_path(path: &str) -> String {
    path.as_bytes()
        .iter()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"/-_.~".contains(b) {
                (*b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
pub fn plan(r: &ProgramRequest) -> Result<ProgramPlan, String> {
    let mut args = Vec::new();
    let user = checked(r.username.as_deref().unwrap_or(""))?;
    let executable = match r.mode.as_str() {
        "ssh" => {
            let h = host(r)?;
            args.extend([
                "-o".into(),
                "StrictHostKeyChecking=ask".into(),
                "-o".into(),
                "ServerAliveInterval=20".into(),
                "-p".into(),
                r.port.unwrap_or(22).to_string(),
            ]);
            if !user.is_empty() {
                args.extend(["-l".into(), user.into()]);
            }
            path_option(&mut args, "-i", r.identity.as_deref())?;
            path_option(&mut args, "-I", r.provider.as_deref())?;
            path_option(&mut args, "-F", r.config.as_deref())?;
            if let Some(c) = r.certificate.as_deref().filter(|s| !s.is_empty()) {
                absolute(c)?;
                args.extend(["-o".into(), ssh_path_option("CertificateFile", c)?]);
            }
            if r.gssapi == Some(true) {
                args.extend(["-o".into(), "GSSAPIAuthentication=yes".into()]);
            }
            if r.agent_forwarding == Some(true) {
                args.push("-A".into());
            }
            if r.x11 == Some(true) {
                args.push("-X".into());
            }
            if let Some(j) = r.jump.as_deref().filter(|s| !s.is_empty()) {
                jump(j)?;
                args.extend(["-J".into(), j.into()]);
            }
            args.extend(["--".into(), h.into()]);
            resolve(r.executable.as_deref(), &["/usr/bin/ssh"])?
        }
        "rdp" => {
            let h = host(r)?;
            let address = if h.contains(':') {
                format!("[{h}]")
            } else {
                h.into()
            };
            args.push(format!("/v:{address}:{}", r.port.unwrap_or(3389)));
            if !user.is_empty() {
                args.push(format!("/u:{user}"));
            }
            args.extend(["/size:1280x800".into(), "/dynamic-resolution".into()]);
            resolve(
                r.executable.as_deref(),
                &[
                    "/opt/homebrew/bin/sdl-freerdp3",
                    "/opt/homebrew/bin/sdl-freerdp",
                    "/usr/local/bin/sdl-freerdp3",
                    "/usr/local/bin/sdl-freerdp",
                    "/Applications/MacFreeRDP.app/Contents/MacOS/MacFreeRDP",
                ],
            )?
        }
        "python" | "javascript" | "jxa" => {
            let script = absolute(r.script.as_deref().unwrap_or(""))?;
            if !Path::new(script).is_file() {
                return Err("스크립트 파일이 없습니다.".into());
            }
            if r.mode == "python" {
                args.push("-u".into());
            }
            if r.mode == "jxa" {
                args.extend(["-l".into(), "JavaScript".into()]);
            }
            args.push(script.into());
            let extra = r.args.as_deref().unwrap_or(&[]);
            if extra.len() > 128 {
                return Err("스크립트 인자는 최대 128개입니다.".into());
            }
            for arg in extra {
                args.push(checked(arg)?.into());
            }
            let choices: &[&str] = match r.mode.as_str() {
                "python" => &[
                    "/opt/homebrew/bin/python3",
                    "/usr/local/bin/python3",
                    "/usr/bin/python3",
                ],
                "javascript" => &["/opt/homebrew/bin/node", "/usr/local/bin/node"],
                _ => &["/usr/bin/osascript"],
            };
            resolve(r.executable.as_deref(), choices)?
        }
        "scp" => {
            let h = host(r)?;
            if user.is_empty() || user.contains(['@', ':', ' ']) {
                return Err("SCP 사용자 이름을 확인하세요.".into());
            }
            let local = absolute(r.local_path.as_deref().unwrap_or(""))?;
            let remote = absolute(r.remote_path.as_deref().unwrap_or(""))?;
            let address = if h.contains(':') {
                format!("[{h}]")
            } else {
                h.into()
            };
            let remote = format!("{user}@{address}:'{}'", remote.replace('\'', "'\\''"));
            args.extend([
                "-O".into(),
                "-P".into(),
                r.port.unwrap_or(22).to_string(),
                "-o".into(),
                "StrictHostKeyChecking=ask".into(),
            ]);
            path_option(&mut args, "-i", r.identity.as_deref())?;
            for (key, value) in [
                ("CertificateFile", r.certificate.as_deref()),
                ("PKCS11Provider", r.provider.as_deref()),
            ] {
                if let Some(value) = value.filter(|s| !s.is_empty()) {
                    absolute(value)?;
                    args.extend(["-o".into(), ssh_path_option(key, value)?]);
                }
            }
            if r.gssapi == Some(true) {
                args.extend(["-o".into(), "GSSAPIAuthentication=yes".into()]);
            }
            if let Some(j) = r.jump.as_deref().filter(|s| !s.is_empty()) {
                args.extend(["-J".into(), jump(j)?.into()]);
            }
            args.push("--".into());
            if r.upload == Some(true) {
                if !Path::new(local).is_file() {
                    return Err("업로드할 파일이 없습니다.".into());
                }
                args.extend([local.into(), remote]);
            } else {
                args.extend([remote, local.into()]);
            }
            resolve(r.executable.as_deref(), &["/usr/bin/scp"])?
        }
        "ftp" => {
            let h = host(r)?;
            let local = absolute(r.local_path.as_deref().unwrap_or(""))?;
            let remote = absolute(r.remote_path.as_deref().unwrap_or(""))?;
            args.extend([
                "--fail".into(),
                "--show-error".into(),
                "--progress-bar".into(),
                "--ftp-pasv".into(),
            ]);
            if r.tls != Some(false) {
                args.push("--ssl-reqd".into());
            }
            if !user.is_empty() {
                if user.contains(':') {
                    return Err("비밀번호는 연결 후 프롬프트에서 입력하세요.".into());
                }
                args.extend(["--user".into(), user.into()]);
            }
            if r.upload == Some(true) {
                if !Path::new(local).is_file() {
                    return Err("업로드할 파일이 없습니다.".into());
                }
                args.extend(["--upload-file".into(), local.into()]);
            } else {
                args.extend(["--output".into(), local.into()]);
            }
            let address = if h.contains(':') {
                format!("[{h}]")
            } else {
                h.into()
            };
            args.push(format!(
                "ftp://{address}:{}/{}",
                r.port.unwrap_or(21),
                encoded_path(remote)
            ));
            resolve(r.executable.as_deref(), &["/usr/bin/curl"])?
        }
        "telnet" | "rlogin" => {
            let h = host(r)?;
            if r.mode == "telnet" {
                args.extend([h.into(), r.port.unwrap_or(23).to_string()]);
            } else {
                if !user.is_empty() {
                    args.extend(["-l".into(), user.into()]);
                }
                args.push(h.into());
            }
            let choices: &[&str] = if r.mode == "telnet" {
                &[
                    "/opt/homebrew/bin/telnet",
                    "/usr/local/bin/telnet",
                    "/usr/bin/telnet",
                ]
            } else {
                &[
                    "/opt/homebrew/bin/rlogin",
                    "/usr/local/bin/rlogin",
                    "/usr/bin/rlogin",
                ]
            };
            resolve(r.executable.as_deref(), choices)?
        }
        _ => return Err("지원하지 않는 실행 방식입니다.".into()),
    };
    if r.port == Some(0) {
        return Err("포트는 1–65535입니다.".into());
    }
    Ok(ProgramPlan {
        executable,
        args,
        title: r.mode.to_uppercase(),
    })
}
#[tauri::command]
pub fn preview_program(request: ProgramRequest) -> Result<ProgramPlan, String> {
    plan(&request)
}
pub fn command(
    request: ProgramRequest,
) -> Result<(CommandBuilder, crate::local::LocalInfo), String> {
    let plan = plan(&request)?;
    let mut cmd = CommandBuilder::new(&plan.executable);
    cmd.args(&plan.args);
    let cwd = request
        .cwd
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    absolute(&cwd)?;
    if !PathBuf::from(&cwd).is_dir() {
        return Err("작업 폴더가 없습니다.".into());
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    Ok((
        cmd,
        crate::local::LocalInfo {
            cwd,
            shell: plan.title,
            pid: 0,
        },
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn input_is_argv_not_shell() {
        let r = ProgramRequest {
            mode: "ssh".into(),
            host: Some("server.test".into()),
            username: Some("user;touch /tmp/no".into()),
            ..Default::default()
        };
        let p = plan(&r).unwrap();
        assert!(p.args.contains(&"user;touch /tmp/no".into()));
        assert_eq!(p.args.last().unwrap(), "server.test");
    }
    #[test]
    fn reject_option_host() {
        let r = ProgramRequest {
            mode: "ssh".into(),
            host: Some("-oProxyCommand=bad".into()),
            ..Default::default()
        };
        assert!(plan(&r).is_err());
    }
    #[test]
    fn path_encoding() {
        assert_eq!(encoded_path("/a b/#x"), "/a%20b/%23x");
    }
}
#[cfg(test)]
mod integration_tests {
    use super::*;
    fn request(mode: &str) -> ProgramRequest {
        ProgramRequest {
            mode: mode.into(),
            host: Some("example.test".into()),
            username: Some("fixture".into()),
            local_path: Some("/tmp/pterm download".into()),
            remote_path: Some("/folder/a b'c".into()),
            ..Default::default()
        }
    }
    #[test]
    fn ssh_configuration_preserves_paths_with_spaces_without_connecting() {
        let mut r = request("ssh");
        r.certificate = Some("/tmp/pterm certificate.pub".into());
        r.jump = Some("dev@jump.example:2222".into());
        r.agent_forwarding = Some(true);
        r.x11 = Some(true);
        let p = plan(&r).unwrap();
        let output = std::process::Command::new(&p.executable)
            .arg("-G")
            .arg("-F")
            .arg("/dev/null")
            .args(&p.args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let text = String::from_utf8_lossy(&output.stdout);
        assert!(text.contains("certificatefile /tmp/pterm certificate.pub"));
        assert!(text.contains("proxyjump dev@jump.example:2222"));
        assert!(text.contains("forwardagent yes"));
        assert!(text.contains("forwardx11 yes"));
    }
    #[test]
    fn scp_quotes_remote_paths_and_carries_authentication_profile() {
        let mut r = request("scp");
        r.provider = Some("/tmp/provider module.dylib".into());
        r.certificate = Some("/tmp/certificate.pub".into());
        r.gssapi = Some(true);
        let p = plan(&r).unwrap();
        assert!(
            p.args
                .contains(&"fixture@example.test:'/folder/a b'\\''c'".into())
        );
        assert!(
            p.args
                .contains(&"PKCS11Provider=\"/tmp/provider module.dylib\"".into())
        );
        assert!(p.args.contains(&"GSSAPIAuthentication=yes".into()));
        assert_eq!(p.args.last().unwrap(), "/tmp/pterm download");
    }
    #[test]
    fn ftp_defaults_to_tls_and_uses_absolute_encoded_remote_path() {
        let r = request("ftp");
        let p = plan(&r).unwrap();
        assert!(p.args.contains(&"--ssl-reqd".into()));
        assert_eq!(
            p.args.last().unwrap(),
            "ftp://example.test:21//folder/a%20b%27c"
        );
        assert!(!p.args.iter().any(|a| a.contains("--insecure")));
    }
    #[test]
    fn script_arguments_are_not_interpreted_by_a_shell() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let r = ProgramRequest {
            mode: "javascript".into(),
            executable: Some("/usr/bin/true".into()),
            script: Some(file.path().to_str().unwrap().into()),
            args: Some(vec!["$(touch /tmp/unwanted); x".into()]),
            ..Default::default()
        };
        let p = plan(&r).unwrap();
        assert_eq!(
            p.args,
            vec![file.path().to_str().unwrap(), "$(touch /tmp/unwanted); x"]
        );
    }
    #[test]
    fn rdp_ipv6_has_no_certificate_bypass_or_password_argument() {
        let mut r = request("rdp");
        r.host = Some("::1".into());
        r.executable = Some("/usr/bin/true".into());
        let p = plan(&r).unwrap();
        assert!(p.args.contains(&"/v:[::1]:3389".into()));
        assert!(
            !p.args
                .iter()
                .any(|a| a.starts_with("/p:") || a.starts_with("/cert:"))
        );
    }
    #[test]
    fn rejects_missing_engines_and_unsafe_jump_strings() {
        let mut r = request("ssh");
        r.jump = Some("host; touch /tmp/unwanted".into());
        assert!(plan(&r).is_err());
        r.jump = None;
        r.executable = Some("/definitely/missing/engine".into());
        assert!(plan(&r).is_err());
    }
}
