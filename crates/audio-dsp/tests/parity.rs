//! Native half of the native and wasm parity check. A seeded signal goes
//! through every kernel; each output is hashed (FNV-1a 64 over the f32 bit
//! patterns) and written to tests/parity.json with the scalars.
//! packages/audio-dsp/test/parity.test.ts runs the same chain on the wasm
//! build and asserts the same hashes and bits. Regenerate with
//! UPDATE_PARITY=1 cargo test -p hackbuild-audio-dsp --test parity.

use hackbuild_audio_dsp::{denoise, fft, filters, levels, math, onset, resample, synth};
use std::fmt::Write;

fn fnv(x: &[f32]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for v in x {
        for b in v.to_bits().to_le_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

fn build() -> String {
    let (seed, n, sr) = (20261122u32, 48000usize, 16000.0);
    let mut s = String::from("{\n");
    let mut step = |name: &str, x: &[f32]| {
        writeln!(
            s,
            "\"{name}\":{{\"len\":{},\"hash\":\"{}\"}},",
            x.len(),
            fnv(x)
        )
        .unwrap();
    };
    let mut raw = vec![0f32; n];
    synth::speechlike(seed, n, sr, &mut raw);
    step("synth", &raw);
    let mut sig = vec![0f32; n];
    filters::dc_block(&raw, &mut sig);
    step("dc", &sig);
    let hp = filters::coef(filters::Kind::Highpass, 80.0, sr, 0.707);
    let mut t = vec![0f32; n];
    filters::biquad(&sig, &hp, &mut t);
    filters::biquad(&t, &hp, &mut sig);
    step("hp2", &sig);
    let mut band = vec![0f32; n];
    filters::biquad(
        &sig,
        &filters::coef(filters::Kind::Highpass, 250.0, sr, 0.707),
        &mut t,
    );
    filters::biquad(
        &t,
        &filters::coef(filters::Kind::Lowpass, 3800.0, sr, 0.707),
        &mut band,
    );
    step("band", &band);
    let nf = levels::frame_count(n, 400, 160);
    let mut vdb = vec![0f32; nf];
    levels::frame_db(&band, 160, 400, &mut vdb);
    step("vdb", &vdb);
    let floor = levels::noise_floor(&vdb, 150);
    let p95 = levels::percentile(&vdb, 0.95);
    let noise = denoise::noise_spectrum(&sig, &vdb, floor, 512, 160).unwrap();
    step("noise", &noise);
    let mut dn = denoise::denoise(&sig, &noise, 1.8, 0.08, 512, 256);
    step("denoise", &dn);
    for v in &mut dn {
        *v *= 8.0;
    }
    filters::limit(&mut dn, 0.891, sr);
    step("limit", &dn);
    let m = resample::out_len(n, sr, 22050.0);
    let mut up = vec![0f32; m];
    resample::sinc_resample(&raw, sr, 22050.0, 16, &mut up);
    step("sinc", &up);
    let mut lin = vec![0f32; m];
    resample::linear(&raw, sr, 22050.0, &mut lin);
    step("linear", &lin);
    let mut dec = vec![0f32; n / 3];
    resample::decimate(&raw, 3, &resample::lowpass_taps(41, 2400.0, sr), &mut dec);
    step("decimate", &dec);
    let (mag, frames) = fft::stft_mag(&raw[..8192], 1024, 512);
    step("stft", &mag);
    let mut env = vec![0f32; n / 128];
    levels::envelope_rms(&raw, 128, &mut env);
    step("rms", &env);
    let mut pk = vec![0f32; 200];
    levels::envelope_peak(&raw, &mut pk);
    step("peak", &pk);
    let fps = sr / 128.0;
    let hits = onset::pick_onsets(&env, fps, 0.05, 1.0, 0.1);
    let (bpm, off) = onset::estimate_tempo(&env, fps);
    let times: Vec<f64> = hits.iter().map(|h| h.frame as f64 / fps).collect();
    let ws: Vec<f64> = hits.iter().map(|h| h.strength as f64).collect();
    let (gb, go, gr) = onset::fit_grid(&times, &ws).unwrap();
    let onsets: Vec<String> = hits
        .iter()
        .map(|h| format!("[{},{},{:?}]", h.frame, h.peak, h.strength as f64))
        .collect();
    writeln!(s, "\"onsets\":[{}],", onsets.join(",")).unwrap();
    writeln!(
        s,
        "\"scalars\":{{\"floor\":{:?},\"p95\":{:?},\"stftFrames\":{frames},\"bpm\":{bpm:?},\"offset\":{off:?},\"grid\":[{gb:?},{go:?},{gr:?}]}},",
        floor as f64, p95 as f64
    )
    .unwrap();
    let xs = [-123.456, -1.0, 0.0, 0.3, 2.5, 99.9, 7777.7];
    let mathv: Vec<String> = xs
        .iter()
        .map(|&x| {
            format!(
                "[{x:?},{:?},{:?},{:?},{:?},{:?}]",
                math::sin(x),
                math::cos(x),
                math::exp(x / 100.0),
                math::ln(x.abs() + 1.0),
                math::atan2(x, 3.0)
            )
        })
        .collect();
    writeln!(s, "\"math\":[{}]", mathv.join(",")).unwrap();
    s.push_str("}\n");
    s
}

#[test]
fn parity_fixture_matches() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/parity.json");
    let got = build();
    if std::env::var("UPDATE_PARITY").is_ok() {
        std::fs::write(path, &got).unwrap();
    }
    let want = std::fs::read_to_string(path).expect("run with UPDATE_PARITY=1 once");
    assert_eq!(
        got, want,
        "native output moved; regenerate and check the wasm side"
    );
}
