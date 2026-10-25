//! macOS PTY sessions. The shell owns job control; no shell command strings are built.
use crate::{Event, Input, SessionControl, Sessions};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, ffi::CStr, path::PathBuf};
use tauri::{State, ipc::Channel};
use tokio::sync::{mpsc, watch};

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRequest {
    pub cwd: Option<String>,
    pub shell: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalInfo {
    pub cwd: String,
    pub shell: String,
    pub pid: u32,
}

fn account() -> Result<(String, String), String> {
    // Reentrant lookup avoids inheriting the developer launcher’s SHELL or working directory.
    let mut entry = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut buffer = vec![0u8; 16384];
    let mut found = std::ptr::null_mut();
    unsafe {
        let result = libc::getpwuid_r(
            libc::getuid(),
            entry.as_mut_ptr(),
            buffer.as_mut_ptr().cast(),
            buffer.len(),
            &mut found,
        );
        if result != 0 || found.is_null() {
            return Err("macOS 사용자 정보를 확인할 수 없습니다.".into());
        }
        let entry = entry.assume_init();
        Ok((
            CStr::from_ptr(entry.pw_dir).to_string_lossy().into_owned(),
            CStr::from_ptr(entry.pw_shell)
                .to_string_lossy()
                .into_owned(),
        ))
    }
}
fn command(request: LocalRequest) -> Result<(CommandBuilder, LocalInfo), String> {
    let (home, default_shell) = account()?;
    let shell = request
        .shell
        .filter(|s| !s.is_empty())
        .unwrap_or(default_shell);
    let allowed =
        std::fs::read_to_string("/etc/shells").map_err(|_| "로그인 셸 목록을 읽을 수 없습니다.")?;
    if !PathBuf::from(&shell).is_absolute() || !allowed.lines().any(|s| s.trim() == shell) {
        return Err("/etc/shells에 등록된 셸의 절대 경로를 입력하세요.".into());
    }
    let cwd = request
        .cwd
        .filter(|s| !s.is_empty())
        .unwrap_or(home.clone());
    let cwd = if cwd == "~" {
        home.clone()
    } else if let Some(rest) = cwd.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else {
        cwd
    };
    if !PathBuf::from(&cwd).is_absolute() || !PathBuf::from(&cwd).is_dir() {
        return Err("존재하는 작업 폴더의 절대 경로를 입력하세요.".into());
    }
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(["-l", "-i"]);
    cmd.cwd(&cwd);
    cmd.env("HOME", &home);
    cmd.env("SHELL", &shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "PolarTerminal");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    if std::env::var("LANG").unwrap_or_default().is_empty() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    // Finder may provide a minimal PATH. Login startup files remain responsible for customization.
    if std::env::var("PATH").unwrap_or_default().is_empty() {
        cmd.env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
    }
    Ok((cmd, LocalInfo { cwd, shell, pid: 0 }))
}

struct LocalPty {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}
impl LocalPty {
    fn spawn(cmd: CommandBuilder) -> Result<Self, String> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let fd = pair.master.as_raw_fd().ok_or("PTY 파일 핸들 오류")?;
        // One owner polls this descriptor. Nonblocking writes keep cancellation responsive.
        unsafe {
            let flags = libc::fcntl(fd, libc::F_GETFL);
            if flags < 0 || libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) < 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        Ok(Self {
            master: pair.master,
            child,
        })
    }
    fn read(&self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let n = unsafe {
            libc::read(
                self.master.as_raw_fd().unwrap(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
            )
        };
        if n < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(n as usize)
        }
    }
    fn write(&self, bytes: &[u8]) -> std::io::Result<usize> {
        let n = unsafe {
            libc::write(
                self.master.as_raw_fd().unwrap(),
                bytes.as_ptr().cast(),
                bytes.len(),
            )
        };
        if n < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(n as usize)
        }
    }
}
impl Drop for LocalPty {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(Some(_))) {
            return;
        }
        // Hang up the foreground job before the shell, including a job that owns another pgrp.
        if let Some(group) = self.master.process_group_leader() {
            unsafe {
                if group > 1 && group != libc::getpgrp() {
                    libc::kill(-group, libc::SIGHUP);
                }
            }
        }
        let _ = self.child.kill(); // portable-pty provides a grace period then SIGKILL.
        let _ = self.child.wait(); // Reap the shell. Dropping master hangs up remaining TTY users.
    }
}
fn retryable(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
    )
}
fn run(
    mut pty: LocalPty,
    mut input: mpsc::Receiver<Input>,
    cancel: watch::Receiver<bool>,
    output: Channel<Event>,
) -> String {
    let mut credits = 8usize;
    let mut pending = VecDeque::new();
    let mut buffer = [0u8; 32768];
    let mut exit = None;
    loop {
        if *cancel.borrow() || cancel.has_changed().is_err() {
            return "로컬 셸을 종료했습니다.".into();
        }
        // The IPC queue plus this buffer is bounded. Never block on a stalled child's stdin.
        for _ in 0..8 {
            match input.try_recv() {
                Ok(Input::Data(bytes)) => {
                    if pending.len() + bytes.len() > 1024 * 1024 {
                        return "로컬 입력 대기열 제한을 초과했습니다.".into();
                    }
                    pending.extend(bytes)
                }
                Ok(Input::Resize(cols, rows)) => {
                    let _ = pty.master.resize(PtySize {
                        cols: cols as u16,
                        rows: rows as u16,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Ok(Input::Ack) => credits = (credits + 1).min(8),
                Err(mpsc::error::TryRecvError::Disconnected) => {
                    return "터미널을 닫았습니다.".into();
                }
                Err(mpsc::error::TryRecvError::Empty) => break,
            }
        }
        if !pending.is_empty() {
            let bytes = pending.make_contiguous();
            match pty.write(bytes) {
                Ok(n) => {
                    pending.drain(..n);
                }
                Err(e) if retryable(&e) => {}
                Err(_) => return "셸 입력 전송이 종료되었습니다.".into(),
            }
        }
        if credits > 0 {
            match pty.read(&mut buffer) {
                Ok(0) => return exit.unwrap_or_else(|| "로컬 셸이 종료되었습니다.".into()),
                Ok(n) => {
                    credits -= 1;
                    if output
                        .send(Event::Data {
                            bytes: buffer[..n].to_vec(),
                        })
                        .is_err()
                    {
                        return "터미널을 닫았습니다.".into();
                    }
                    continue;
                }
                Err(e) if retryable(&e) => {
                    if let Some(message) = exit {
                        return message;
                    }
                }
                Err(_) => return exit.unwrap_or_else(|| "로컬 셸이 종료되었습니다.".into()),
            }
        }
        if exit.is_none() {
            match pty.child.try_wait() {
                Ok(Some(status)) => exit = Some(format!("로컬 셸 종료 · {status}")),
                Ok(None) => {}
                Err(_) => return "셸 상태 확인 실패".into(),
            }
        }
        let mut pollfd = libc::pollfd {
            fd: pty.master.as_raw_fd().unwrap(),
            events: if credits > 0 { libc::POLLIN } else { 0 },
            revents: 0,
        };
        if credits == 0 {
            std::thread::sleep(std::time::Duration::from_millis(20));
        } else {
            unsafe {
                libc::poll(&mut pollfd, 1, 20);
            }
        }
    }
}
#[tauri::command]
pub async fn start_local(
    id: String,
    request: LocalRequest,
    output: Channel<Event>,
    state: State<'_, Sessions>,
) -> Result<LocalInfo, String> {
    uuid::Uuid::parse_str(&id).map_err(|_| "잘못된 세션 ID")?;
    let (tx, rx) = mpsc::channel(64);
    let (cancel, receiver) = watch::channel(false);
    {
        let mut map = state.0.lock().map_err(|_| "세션 상태 오류")?;
        if map.len() >= 16 || map.contains_key(&id) {
            return Err("세션은 최대 16개까지 열 수 있습니다.".into());
        }
        map.insert(
            id.clone(),
            SessionControl {
                input: tx,
                cancel,
                transport: None,
            },
        );
    }
    let sessions = state.inner().clone();
    let (ready, wait) = tokio::sync::oneshot::channel();
    tauri::async_runtime::spawn_blocking(move || {
        let started = command(request).and_then(|(cmd, mut info)| {
            let pty = LocalPty::spawn(cmd)?;
            info.pid = pty.child.process_id().unwrap_or(0);
            Ok((pty, info))
        });
        let message = match started {
            Ok((pty, info)) => {
                let _ = ready.send(Ok(info));
                run(pty, rx, receiver, output.clone())
            }
            Err(e) => {
                let _ = ready.send(Err(e.clone()));
                e
            }
        };
        if let Ok(mut map) = sessions.0.lock() {
            map.remove(&id);
        }
        let _ = output.send(Event::Closed { message, retryable: false });
    });
    wait.await.map_err(|_| "로컬 셸 시작 실패".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    fn shell(dir: &std::path::Path) -> LocalPty {
        let mut cmd = CommandBuilder::new("/bin/zsh");
        cmd.args(["-f", "-i"]);
        cmd.cwd(dir);
        cmd.env("TERM", "xterm-256color");
        cmd.env("PS1", "POLAR_TEST_READY> ");
        cmd.env("PROMPT", "POLAR_TEST_READY> ");
        let pty = LocalPty::spawn(cmd).unwrap();
        until(&pty, "POLAR_TEST_READY>");
        pty
    }
    fn send(pty: &LocalPty, text: &[u8]) {
        let mut rest = text;
        let deadline = Instant::now() + Duration::from_secs(3);
        while !rest.is_empty() {
            assert!(Instant::now() < deadline, "write timed out");
            match pty.write(rest) {
                Ok(n) => rest = &rest[n..],
                Err(e) if retryable(&e) => std::thread::sleep(Duration::from_millis(5)),
                Err(e) => panic!("{e}"),
            }
        }
    }
    fn until(pty: &LocalPty, needle: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut text = String::new();
        let mut bytes = [0; 32768];
        while !text.contains(needle) {
            assert!(Instant::now() < deadline, "missing {needle}: {text}");
            match pty.read(&mut bytes) {
                Ok(0) => panic!("unexpected EOF: {text}"),
                Ok(n) => text.push_str(&String::from_utf8_lossy(&bytes[..n])),
                Err(e) if retryable(&e) => std::thread::sleep(Duration::from_millis(5)),
                Err(e) => panic!("{e}: {text}"),
            }
        }
        text
    }
    #[test]
    fn local_pty_is_tty_preserves_cwd_unicode_and_resizes() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().join("작업 폴더");
        std::fs::create_dir(&cwd).unwrap();
        let pty = shell(&cwd);
        send(&pty, b"stty -echo; test -t 0 && printf 'TTY_%s\\n' OK\n");
        until(&pty, "TTY_OK");
        send(
            &pty,
            "printf '%s\\n' \"$PWD\"; printf '한글 %s\\n' '❄️'; printf 'DONE_%s\\n' CWD\n"
                .as_bytes(),
        );
        let out = until(&pty, "DONE_CWD");
        assert!(out.contains(cwd.to_str().unwrap()));
        assert!(out.contains("한글 ❄️"));
        pty.master
            .resize(PtySize {
                rows: 41,
                cols: 117,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        send(&pty, b"stty size; printf 'DONE_%s\\n' SIZE\n");
        assert!(until(&pty, "DONE_SIZE").contains("41 117"));
    }
    #[test]
    fn ctrl_c_interrupts_foreground_and_shell_remains_usable() {
        let root = tempfile::tempdir().unwrap();
        let pty = shell(root.path());
        send(&pty, b"stty -echo; printf 'READY_%s\\n' SLEEP; sleep 30\n");
        until(&pty, "READY_SLEEP");
        // Wait until the foreground job has taken ownership of the tty.
        let deadline = Instant::now() + Duration::from_secs(3);
        while pty.master.process_group_leader() == pty.child.process_id().map(|p| p as i32) {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(5));
        }
        send(&pty, &[3]);
        send(&pty, b"printf 'AFTER_%s\\n' INTERRUPT\n");
        until(&pty, "AFTER_INTERRUPT");
    }
    #[test]
    fn close_reaps_shell_and_hangs_up_foreground_job() {
        let root = tempfile::tempdir().unwrap();
        let pty = shell(root.path());
        let pid = pty.child.process_id().unwrap() as i32;
        send(&pty, b"stty -echo; printf 'READY_%s\\n' CHILD; sleep 30\n");
        until(&pty, "READY_CHILD");
        let deadline = Instant::now() + Duration::from_secs(3);
        let foreground = loop {
            let p = pty.master.process_group_leader().unwrap();
            if p != pid {
                break p;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(5));
        };
        drop(pty);
        assert_eq!(unsafe { libc::kill(pid, 0) }, -1, "shell still exists");
        let deadline = Instant::now() + Duration::from_secs(3);
        while unsafe { libc::kill(foreground, 0) } == 0 {
            assert!(Instant::now() < deadline, "foreground job survived");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    #[test]
    fn invalid_directory_and_shell_do_not_spawn() {
        assert!(
            command(LocalRequest {
                cwd: Some("/nonexistent/polar-fixture".into()),
                shell: Some("/bin/zsh".into())
            })
            .is_err()
        );
        assert!(
            command(LocalRequest {
                cwd: None,
                shell: Some("/bin/zsh; touch /tmp/not-executed".into())
            })
            .is_err()
        );
        let (_, info) = command(LocalRequest::default()).unwrap();
        assert!(PathBuf::from(info.cwd).is_absolute());
    }
    #[test]
    fn sessions_are_independent_and_exit_status_is_reaped() {
        let root = tempfile::tempdir().unwrap();
        let mut first = shell(root.path());
        let second = shell(root.path());
        send(&first, b"exit 7\n");
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut diagnostic = String::new();
        let mut buffer = [0u8; 4096];
        let status = loop {
            if let Ok(n) = first.read(&mut buffer) {
                diagnostic.push_str(&String::from_utf8_lossy(&buffer[..n]));
            }
            if let Some(status) = first.child.try_wait().unwrap() {
                break status;
            }
            assert!(
                Instant::now() < deadline,
                "shell exit timed out: {diagnostic}"
            );
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(status.exit_code(), 7);
        send(&second, b"printf 'SECOND_%s\\n' ALIVE\n");
        until(&second, "SECOND_ALIVE");
    }
    #[test]
    fn cancel_remains_responsive_when_output_is_backpressured() {
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let root = tempfile::tempdir().unwrap();
        let pty = shell(root.path());
        send(&pty, b"stty -echo; /usr/bin/yes flood\n");
        let (_input, rx) = mpsc::channel(64);
        let (cancel, receiver) = watch::channel(false);
        let count = Arc::new(AtomicUsize::new(0));
        let observed = count.clone();
        let output = Channel::new(move |_| {
            observed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let (done, finished) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let message = run(pty, rx, receiver, output);
            done.send(message).unwrap();
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while count.load(Ordering::SeqCst) < 8 {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(5));
        }
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(count.load(Ordering::SeqCst), 8);
        cancel.send(true).unwrap();
        assert!(
            finished
                .recv_timeout(Duration::from_secs(3))
                .unwrap()
                .contains("종료")
        );
        thread.join().unwrap();
    }
    #[test]
    fn repeated_parallel_shells_drain_output_and_leave_no_child_processes() {
        let root = tempfile::tempdir().unwrap();
        for _ in 0..5 {
            let panes: Vec<_> = (0..8).map(|_| shell(root.path())).collect();
            for pty in &panes {
                send(pty, b"stty -echo; repeat 200 printf 'output-line\\n'; printf 'cycle_%s\\n' READY\n");
            }
            for pty in panes {
                let output = until(&pty, "cycle_READY");
                assert!(output.matches("output-line").count() >= 200);
                let pid = pty.child.process_id().unwrap() as i32;
                drop(pty);
                assert_eq!(unsafe { libc::kill(pid, 0) }, -1, "shell survived close");
            }
        }
    }

    #[test]
    #[ignore = "Explicit two-minute isolated PTY soak"]
    fn sustained_parallel_pty_output_remains_responsive() {
        let root=tempfile::tempdir().unwrap();
        let panes:Vec<_>=(0..8).map(|_|shell(root.path())).collect();
        let start=Instant::now();let mut rounds=0;
        while start.elapsed()<Duration::from_secs(120) {
            for pty in &panes {send(pty,b"stty -echo; repeat 200 printf 'SOAK_DATA\\n'; printf 'SOAK_%s\\n' READY\n");}
            for pty in &panes {let output=until(pty,"SOAK_READY");assert!(output.matches("SOAK_DATA").count()>=200);}
            rounds+=1;std::thread::sleep(Duration::from_millis(250));
        }
        for pty in panes {let pid=pty.child.process_id().unwrap() as i32;drop(pty);assert_eq!(unsafe{libc::kill(pid,0)},-1);}
        let mut usage:libc::rusage=unsafe{std::mem::zeroed()};unsafe{libc::getrusage(libc::RUSAGE_SELF,&mut usage);}
        println!("PTY_SOAK rounds={rounds} shells=8 lines={} elapsed_seconds={} maxrss_native_units={}",rounds*8*200,start.elapsed().as_secs(),usage.ru_maxrss);
    }

}
