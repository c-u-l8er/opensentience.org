// rng.rs — a tiny self-contained PRNG (xorshift64*), seeded from the system clock.
// ZERO external dependencies. Mirrors the role of Math.random() in the JS suite.

use std::cell::Cell;
use std::time::{SystemTime, UNIX_EPOCH};

thread_local! {
    static STATE: Cell<u64> = Cell::new(seed());
}

fn seed() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    // mix so a low-entropy clock still gives a usable seed
    let mut s = nanos ^ 0x9E3779B97F4A7C15;
    s = (s ^ (s >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    s = (s ^ (s >> 27)).wrapping_mul(0x94D049BB133111EB);
    s ^ (s >> 31) | 1 // never zero
}

fn next_u64() -> u64 {
    STATE.with(|st| {
        let mut x = st.get();
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        st.set(x);
        x.wrapping_mul(0x2545F4914F6CDD1D)
    })
}

// uniform float in [0, 1)
pub fn random() -> f64 {
    // top 53 bits → double in [0,1)
    (next_u64() >> 11) as f64 / ((1u64 << 53) as f64)
}

// uniform float in [a, b)
pub fn rnd(a: f64, b: f64) -> f64 {
    a + random() * (b - a)
}

// uniform integer in [0, n)
pub fn ri(n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    (random() * n as f64) as usize % n
}

// JS-style `(Math.random() * n) | 0` — floor, clamped to <n
pub fn idx(n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    let v = (random() * n as f64) as usize;
    if v >= n {
        n - 1
    } else {
        v
    }
}

pub fn chance(p: f64) -> bool {
    random() < p
}

// round to k decimals like JS +x.toFixed(k)
pub fn to_fixed(x: f64, k: i32) -> f64 {
    let f = 10f64.powi(k);
    (x * f).round() / f
}
