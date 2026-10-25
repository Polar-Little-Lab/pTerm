// Preserve the server's explicit process result even if the TCP stream ends next.
#[derive(Debug, Default, PartialEq)]
pub enum SessionEnd {
    #[default]
    Closed,
    Process(u32),
    Signal,
    Network,
    InputFailure,
    Parent,
    Rejected,
}
impl SessionEnd {
    pub fn transport_lost(&mut self) {
        if !matches!(self, Self::Process(_) | Self::Signal) { *self = Self::Network; }
    }
    pub fn input_failed(&mut self) {
        if !matches!(self, Self::Process(_) | Self::Signal) { *self = Self::InputFailure; }
    }
    pub fn retryable(&self) -> bool { matches!(self, Self::Network | Self::InputFailure) }
    pub fn message(&self) -> String {
        match self {
            Self::Closed => "연결이 종료되었습니다.".into(),
            Self::Process(code) => format!("프로세스 종료 · 코드 {code}"),
            Self::Signal => "원격 프로세스가 신호로 종료되었습니다.".into(),
            Self::Network => "네트워크 연결이 끊어졌습니다.".into(),
            Self::InputFailure => "입력 전송에 실패했습니다.".into(),
            Self::Parent => "Bastion 연결이 종료되었습니다.".into(),
            Self::Rejected => "서버가 터미널 요청을 거부했습니다.".into(),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_exit_followed_by_tcp_close_never_reconnects() {
        for mut end in [SessionEnd::Process(0), SessionEnd::Process(1), SessionEnd::Signal] {
            let before=end.message();end.transport_lost();end.input_failed();assert!(!end.retryable());assert_eq!(end.message(),before);
        }
    }
    #[test]
    fn only_unexpected_transport_failures_are_retryable() {
        let mut end=SessionEnd::Closed;end.transport_lost();assert!(end.retryable());
        assert!(SessionEnd::InputFailure.retryable());
        for end in [SessionEnd::Closed,SessionEnd::Parent,SessionEnd::Rejected] {assert!(!end.retryable());}
    }
}
