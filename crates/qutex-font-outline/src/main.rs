use qutex_font_outline::{FontSession, MAX_LINE_BYTES};
use serde_json::json;
use std::{
    env, fs,
    io::{self, BufRead, Write},
    process::ExitCode,
};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("qutex-font-outline: {error}");
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let path = args
        .next()
        .ok_or("usage: qutex-font-outline FONT.ttf|FONT.otf [FACE_INDEX]")?;
    if path == "--help" || path == "-h" {
        println!(
            "qutex-font-outline FONT.ttf|FONT.otf [FACE_INDEX]\nPersistent JSONL font metadata, glyphs, and MATH variants. See docs/rust.md."
        );
        return Ok(());
    }
    let index: u32 = args.next().map(|v| v.parse()).transpose()?.unwrap_or(0);
    if args.next().is_some() {
        return Err("Unexpected command-line argument".into());
    }
    let bytes = fs::read(path)?;
    let mut session = FontSession::new(&bytes, index)?;
    let mut stdin = io::stdin().lock();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    while let Some(line) = bounded_line(&mut stdin)? {
        let response = match line {
            Some(line) => session.handle_json(&line),
            None => json!({"id": null, "ok": false, "error": "Request exceeds 512 KiB line limit"}),
        };
        serde_json::to_writer(&mut stdout, &response)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    Ok(())
}

/// Consume overlong lines without allocating their complete contents; recover on next line.
fn bounded_line(reader: &mut impl BufRead) -> io::Result<Option<Option<Vec<u8>>>> {
    let mut line = Vec::new();
    let mut too_large = false;
    let mut saw_bytes = false;
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok(saw_bytes.then_some(if too_large { None } else { Some(line) }));
        }
        saw_bytes = true;
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let count = newline.map_or(buffer.len(), |position| position + 1);
        if !too_large && line.len() + count <= MAX_LINE_BYTES {
            line.extend_from_slice(&buffer[..count]);
        } else {
            too_large = true;
        }
        reader.consume(count);
        if newline.is_some() {
            return Ok(Some(if too_large { None } else { Some(line) }));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn overlong_line_does_not_poison_the_following_request() {
        let mut bytes = vec![b'x'; MAX_LINE_BYTES + 12];
        bytes.extend_from_slice(b"\n{}\n");
        let mut reader = io::Cursor::new(bytes);
        assert_eq!(bounded_line(&mut reader).unwrap(), Some(None));
        assert_eq!(
            bounded_line(&mut reader).unwrap(),
            Some(Some(b"{}\n".to_vec()))
        );
        assert_eq!(bounded_line(&mut reader).unwrap(), None);
    }
}
