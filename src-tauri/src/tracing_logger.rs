use std::sync::{LazyLock, Mutex};

use tracing_subscriber::fmt::MakeWriter;

static LOG_BUFFER: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| Mutex::new(Vec::new()));

struct LogWriter;

impl std::io::Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if let Ok(line) = std::str::from_utf8(buf) {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() {
                let mut logs = LOG_BUFFER.lock().unwrap();
                logs.push(trimmed);
                if logs.len() > 1000 {
                    logs.remove(0);
                }
            }
        }
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> MakeWriter<'a> for LogWriter {
    type Writer = LogWriter;
    fn make_writer(&self) -> Self::Writer {
        LogWriter
    }
}

pub fn init_tracing() {
    tracing_subscriber::fmt()
        .with_writer(LogWriter)
        .with_ansi(false)
        .with_env_filter("folio=debug,info")
        .init();
}

pub fn get_logs() -> Vec<String> {
    LOG_BUFFER.lock().unwrap().clone()
}
