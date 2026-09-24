import os, sys, time, subprocess
import numpy as np, cv2, librosa, warnings
from scipy.signal import find_peaks
from scipy.interpolate import PchipInterpolator
from PIL import Image, ImageDraw, ImageFont
warnings.filterwarnings('ignore')
cv2.setNumThreads(1)

HERE = os.path.dirname(os.path.abspath(__file__))
MP3 = os.environ.get('MP3', os.path.join(os.path.dirname(HERE), 'audio', 'jagada.mp3'))
FPS = 30
W = int(os.environ.get('RW', 1080)); H = int(os.environ.get('RH', 1920))
SC = W / 1080.0
TWO_PI = 2 * np.pi
FONT = os.environ.get('FONT', os.path.join(HERE, 'assets', 'fonts', 'poppins-latin-700-normal.woff2'))


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def ar(x, a=0.65, r=0.10):
    y = np.zeros_like(x); v = 0.0
    for i, xi in enumerate(x):
        v = v + (xi - v) * (a if xi > v else r)
        y[i] = v
    return y


def pal(h, sat=1.0):
    h = np.asarray(h, np.float32)
    ph = TWO_PI * (h[..., None] + np.array([0.0, 1 / 3, 2 / 3], np.float32))
    c = (0.5 + 0.5 * np.cos(ph)) ** 1.6
    c = c / np.maximum(c.max(-1, keepdims=True), 1e-3)
    s = np.asarray(sat, np.float32)
    if s.ndim: s = s[..., None]
    return (s * c + (1 - s)).astype(np.float32)


# ---------------------------------------------------------------- audio
def analyse():
    y, sr = librosa.load(MP3, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 512
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
    tt = librosa.times_like(S[0], sr=sr, hop_length=hop)

    def band(lo, hi):
        m = (fr >= lo) & (fr < hi); b = S[m].mean(0)
        return b / np.percentile(b, 98)
    bass, mid, high = band(30, 150), band(150, 2500), band(2500, 9000)
    rms = librosa.feature.rms(S=S, hop_length=hop)[0]; rms = rms / np.percentile(rms, 98)
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    _, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, start_bpm=120)
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    pk, _ = find_peaks(oenv, height=5.5, distance=int(0.25 * sr / hop))
    DROPS = [1.60, 16.83, 33.11, 49.20]
    ev = []
    for p in pk:
        t, o = tt[p], oenv[p]
        if any(abs(t - d) < 0.08 for d in DROPS): kind = 3
        elif o >= 10: kind = 2
        elif o >= 7.5: kind = 1
        else: kind = 0
        # pre-drop "inhale" hits are handled by the contraction, not by bursts
        if 15.2 < t < 16.7 or 31.7 < t < 33.0 or 48.1 < t < 49.1: kind = min(kind, 0)
        ev.append((float(t), float(min(o / 14.0, 1.0)), kind))
    return dict(dur=dur, tt=tt, bass=bass, mid=mid, high=high, rms=rms, bt=bt, ev=ev, DROPS=DROPS)


# ---------------------------------------------------------------- scene
IMPL = [(15.15, 16.83), (31.70, 33.11), (48.10, 49.20)]
KF = [  # t, elev(deg), dist, roll(deg), target_y, focal
    (0.0, 16, 9.5, -6, 0.0, 1.00), (2.5, 24, 8.0, -4, 0.0, 1.00), (5.0, 48, 6.6, 3, 0.0, 1.05),
    (7.0, 12, 5.5, -5, 0.2, 1.05), (9.5, 6, 5.0, 4, 0.3, 1.10), (12.0, 55, 6.0, -3, 0.0, 1.00),
    (15.6, 80, 4.2, 0, 0.0, 1.00), (16.83, 24, 7.5, 8, 0.0, 1.15), (21.0, 10, 6.0, -6, 0.3, 1.00),
    (25.0, 30, 5.5, 5, 0.0, 1.00), (28.5, 4, 5.0, -4, 0.3, 1.05), (31.8, -18, 5.5, 0, 0.0, 1.00),
    (33.11, -52, 4.8, 6, 0.0, 1.15), (37.0, -38, 5.6, -5, 0.0, 1.05), (41.0, -60, 4.5, 4, 0.0, 1.10),
    (45.0, -20, 6.5, -3, 0.0, 1.00), (48.0, 8, 8.0, -5, 0.0, 1.00), (49.5, 16, 9.5, -6, 0.0, 1.00)]


class Scene:
    def __init__(self):
        A = analyse(); self.A = A
        self.nfr = int(round(A['dur'] * FPS)); ft = np.arange(self.nfr) / FPS; self.ft = ft
        on = lambda a: np.interp(ft, A['tt'], a)
        self.e = np.clip(ar(on(A['rms']), 0.5, 0.06), 0, 1.3)
        self.bass = np.clip(ar(on(A['bass']), 0.7, 0.12), 0, 1.5)
        self.high = np.clip(ar(on(A['high']), 0.6, 0.10), 0, 1.5)
        # beat pulse
        bt = A['bt']; p = np.zeros(self.nfr)
        for i, t in enumerate(ft):
            k = np.searchsorted(bt, t) - 1
            if k >= 0: p[i] = np.exp(-(t - bt[k]) * 7.0)
        self.pulse = p
        # kick / drop envelopes
        kick = np.zeros(self.nfr); dropf = np.zeros(self.nfr)
        for t0, s, kind in A['ev']:
            if kind >= 1:
                m = ft >= t0
                kick[m] += s * (0.5 + 0.25 * kind) * np.exp(-(ft[m] - t0) * 6.5)
        for d in A['DROPS']:
            m = ft >= d; dropf[m] += np.exp(-(ft[m] - d) * 4.0)
        self.kick = np.clip(kick, 0, 1.6); self.dropf = np.clip(dropf, 0, 1.2)
        dt = 1 / FPS
        self.spin = np.cumsum((0.55 + 1.5 * self.e + 0.9 * self.bass) * dt)
        self.az = np.deg2rad(20) + np.cumsum((4 + 14 * self.e + 40 * self.dropf) * dt) * np.pi / 180
        kt = [k[0] for k in KF]
        self.KE = PchipInterpolator(kt, [k[1] for k in KF]); self.KD = PchipInterpolator(kt, [k[2] for k in KF])
        self.KR = PchipInterpolator(kt, [k[3] for k in KF]); self.KT = PchipInterpolator(kt, [k[4] for k in KF])
        self.KF_ = PchipInterpolator(kt, [k[5] for k in KF])
        # hue drift + drop jumps
        hue = 0.12 + 0.032 * ft
        for d in A['DROPS']: hue = hue + 0.25 * smoothstep((ft - d) / 0.25)
        self.hue0 = hue
        rng = np.random.default_rng(11); self.rng = rng
        NS = 90000; u = rng.random(NS)
        self.r0 = (0.5 + 7.4 * u ** 1.55).astype(np.float32)
        self.th0 = (rng.random(NS) * TWO_PI).astype(np.float32)
        self.hs = rng.random(NS).astype(np.float32)
        NRIM = 5000
        self.rimth = np.linspace(0, TWO_PI, NRIM, endpoint=False).astype(np.float32)
        NB = 650
        self.bx = (0.5 + 3.6 * np.sqrt(rng.random(NB))).astype(np.float32); self.bphi = (rng.random(NB) * TWO_PI).astype(np.float32)
        self.bph = rng.random(NB).astype(np.float32) * 13; self.bsp = (0.8 + 0.7 * rng.random(NB)).astype(np.float32); self.bh = rng.random(NB).astype(np.float32)
        NP = 7000
        self.sx = (0.3 + 5.5 * np.sqrt(rng.random(NP))).astype(np.float32); self.sphi = (rng.random(NP) * TWO_PI).astype(np.float32)
        self.sph = rng.random(NP).astype(np.float32) * 13; self.ssp = (0.6 + 1.0 * rng.random(NP)).astype(np.float32); self.sh = rng.random(NP).astype(np.float32)
        # burst / shell data per event
        self.bursts = {}
        for idx, (t0, s, kind) in enumerate(A['ev']):
            if kind >= 2:
                n = 500 + 1500 * kind
                v = rng.normal(size=(n, 3)); v /= np.linalg.norm(v, axis=1, keepdims=True)
                self.bursts[idx] = dict(d=v.astype(np.float32), sp=(1.2 + 6.0 * rng.random(n) ** 1.3).astype(np.float32),
                                        hu=rng.random(n).astype(np.float32), big=(rng.random(n) < 0.12))
        M = 3200; i = np.arange(M) + 0.5
        phi = np.arccos(1 - 2 * i / M); th = np.pi * (1 + 5 ** 0.5) * i
        self.fib = np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1).astype(np.float32)
        # vignette + grain pool + text
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.68)) ** 2)
        self.vig = np.clip(1.05 - 0.55 * d ** 2.2, 0.25, 1.0)[..., None].astype(np.float32)
        self.grain = [(np.random.default_rng(100 + k).normal(0, 1.4, (H, W, 1))).astype(np.float32) for k in range(3)]
        self.texts = self.make_texts()

    # ------------------------------------------------------------ text overlays
    def make_texts(self):
        def layer(lines, cy):
            img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img); y = cy
            for txt, size, gap in lines:
                f = ImageFont.truetype(FONT, int(size * SC))
                bb = d.textbbox((0, 0), txt, font=f)
                d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], y - bb[1]), txt, font=f, fill=255)
                y += (bb[3] - bb[1]) + int(gap * SC)
            a = np.asarray(img, np.float32) / 255
            ys, xs = np.where(a > 0.02); y0, y1, x0, x1 = max(ys.min() - 60, 0), min(ys.max() + 60, H), max(xs.min() - 60, 0), min(xs.max() + 60, W)
            a = a[y0:y1, x0:x1]
            sh = cv2.GaussianBlur(a, (0, 0), 14 * SC)
            return dict(a=a, sh=np.clip(sh * 2.2, 0, 1), box=(y0, y1, x0, x1))
        return dict(hook=layer([("JAGADA JAGADA", 96, 34), ("wait for the drop", 54, 0)], int(430 * SC)),
                    end=layer([("send this to someone", 50, 14), ("who knows every word", 50, 0)], int(1130 * SC)))

    def text_alpha(self, t):
        h = smoothstep((t - 0.2) / 0.35) * (1 - smoothstep((t - 3.3) / 0.45))
        e = smoothstep((t - 44.6) / 0.5) * (1 - smoothstep((t - 48.4) / 0.4))
        return h, e

    # ------------------------------------------------------------ frame
    def render(self, t, with_text=True):
        i = min(int(round(t * FPS)), self.nfr - 1)
        e, bass, high, pul, kick, dropf, S = self.e[i], self.bass[i], self.high[i], self.pulse[i], self.kick[i], self.dropf[i], self.spin[i]
        hue0 = self.hue0[i]
        sat_g = 0.30 + 0.70 * smoothstep(t / 2.2)
        A = self.A
        # ---- contraction (inhale before drops, rebound after)
        c = 0.0; dim = 1.0
        for a, b in IMPL:
            if a <= t < b:
                x = (t - a) / (b - a); c = 0.62 * smoothstep(x) ** 1.5; dim = 1 - 0.55 * x
            elif t >= b:
                c += -0.33 * np.exp(-(t - b) * 3.0)
        # ---- camera
        elev = np.deg2rad(float(self.KE(t))); dist = float(self.KD(t)) * (1 - 0.03 * pul - 0.07 * dropf - 0.04 * kick)
        roll = np.deg2rad(float(self.KR(t)) + 0.6 * np.sin(1.3 * t) + 4.0 * dropf * np.sin(9 * t))
        ty = float(self.KT(t)); fpx = W * 1.05 * float(self.KF_(t))
        az = self.az[i]
        tgt = np.array([0, ty, 0], np.float32)
        cam = tgt + dist * np.array([np.cos(elev) * np.sin(az), np.sin(elev), np.cos(elev) * np.cos(az)], np.float32)
        f = tgt - cam; f /= np.linalg.norm(f)
        rt = np.cross(f, [0, 1, 0]); rt /= np.linalg.norm(rt); up = np.cross(rt, f)
        rt2 = rt * np.cos(roll) + up * np.sin(roll); up2 = -rt * np.sin(roll) + up * np.cos(roll)
        zf = dist; aper = 0.05

        Xs, Ys, Cs, COL, WT = [], [], [], [], []

        def add(P, col, inten, extra=0.0, gain=1.0):
            d = P - cam; x = d @ rt2; y = d @ up2; z = d @ f
            ok = z > 0.35
            x, y, z = x[ok], y[ok], z[ok]
            sx = W / 2 + fpx * x / z; sy = H / 2 - fpx * y / z
            coc = np.minimum(aper * fpx * np.abs(1 / zf - 1 / z) * (W / 1080) * 1.0, 70 * SC)
            coc = coc + extra * SC if np.isscalar(extra) else coc + extra[ok] * SC
            ii = inten[ok] if np.ndim(inten) else np.full(z.shape, inten, np.float32)
            w = ii * gain * (1 + (coc / (4 * SC)) ** 1.4) / (1 + (z / 14) ** 2)
            Xs.append(sx); Ys.append(sy); Cs.append(coc); COL.append(col[ok]); WT.append(w)

        # ---- sheet
        r = self.r0; th = self.th0 + 2.2 / (r + 0.7) ** 1.1 * S
        arm = np.sin(2 * th - 2.4 * np.log(r + 0.6) - 1.1 * S * 0.9)
        amp = 0.35 + 0.9 * e
        reff = r * (1 + 0.06 * arm * amp) * (1 - c)
        yv = 0.55 * amp * np.exp(-r / 2.6) * arm - (0.7 + 1.6 * bass) * np.exp(-(r / 1.25) ** 2)
        bright = 0.22 + 0.95 * (0.5 + 0.5 * arm) ** 3
        for t0, s, kind in A['ev']:
            tau = t - t0
            if 0 <= tau < 3.0 and kind >= 1:
                rr = 0.7 + (3.4 + 0.5 * kind) * tau
                wv = s * (0.5 + 0.3 * kind) * np.exp(-tau * 0.9) * np.exp(-((r - rr) / 0.5) ** 2)
                yv = yv + 0.8 * wv * np.cos(6 * (r - rr)); bright = bright + 2.6 * wv
        tw = 0.8 + 0.2 * np.sin(37 * self.hs + 11 * t)
        h = hue0 + 0.22 * np.sin(th) + 0.16 * np.cos(2 * th + 0.4) + 0.05 * reff + 0.10 * self.hs
        P = np.stack([reff * np.cos(th), yv, reff * np.sin(th)], 1)
        add(P, pal(h, sat_g), bright * tw * (0.55 + 0.6 * e) * dim, gain=0.62)
        # ---- rim (horizon arc) + inner ring on the sphere
        rimh = hue0 + 0.5 * np.sin(self.rimth * 2) * 0.5 + 0.3
        P = np.stack([(8.0 * (1 - c * 0.25)) * np.cos(self.rimth), 0.05 + 0.1 * np.sin(6 * self.rimth + 2 * t), (8.0 * (1 - c * 0.25)) * np.sin(self.rimth)], 1)
        add(P, pal(rimh, sat_g), 0.5 + 0.5 * pul + 0.4 * kick, gain=0.55)
        th2 = self.rimth; rr2 = 0.62 + 0.18 * bass + 0.5 * kick * 0.3
        P = np.stack([rr2 * np.cos(th2), 0.03 + 0.04 * np.sin(8 * th2 + 5 * t), rr2 * np.sin(th2)], 1)
        add(P, pal(hue0 + 0.45 + 0 * th2, 0.6), np.full(len(th2), 1.6 + 1.6 * kick, np.float32), gain=0.7)
        # ---- rain (bokeh) + sparks
        def rain(x0, phi, ph, sp, hh, big, gain, hueadd, inten):
            yy = 6.5 - np.mod(t * sp + ph, 13.0); k = (6.5 - yy) / 13.0
            rr = x0 * (1 - 0.5 * k) * (1 - c * 0.7); a = phi + 0.5 * S * (1 - 0.6 * k) * (1 / (0.6 + x0 * 0.3))
            P = np.stack([rr * np.cos(a), yy, rr * np.sin(a)], 1)
            add(P, pal(hue0 + hueadd * hh + 0.06 * yy, sat_g), inten * (0.55 + 0.6 * e) * dim, extra=big, gain=gain)
        rain(self.bx, self.bphi, self.bph, self.bsp, self.bh, 3.0, 1.3, 0.5, 1.0)
        rain(self.sx, self.sphi, self.sph, self.ssp, self.sh, 0.0, 0.55, 0.45, 0.9 + 0.8 * high)
        # ---- events: bursts, shells, rings
        for idx, (t0, s, kind) in enumerate(A['ev']):
            tau = t - t0
            if tau < 0 or tau > 2.6 or kind < 1: continue
            hh = hue0 + 0.13 * idx
            if kind >= 2:
                b = self.bursts[idx]
                dpos = b['d'] * (b['sp'] * (1 - np.exp(-2.2 * tau)) / 2.2)[:, None] * (0.8 + 0.5 * kind * 0.4)
                P = dpos + np.array([0, 0.15, 0], np.float32); P[:, 1] -= 0.35 * tau * tau
                al = np.exp(-1.1 * tau) * (1 - np.exp(-30 * tau)) * (0.5 + 0.5 * s)
                add(P, pal(hh + 0.5 * b['hu'], 1.0), al * np.full(len(P), 1.5, np.float32), extra=np.where(b['big'], 9.0, 0.0).astype(np.float32), gain=0.9)
                Rs = 0.5 + 4.2 * (1 - np.exp(-1.8 * tau)) * (0.85 + 0.15 * kind)
                Q = self.fib * Rs * np.array([1, 0.85, 1], np.float32)
                add(Q, pal(hh + 0.1 * self.fib[:, 1] + 0.1, 0.85), np.full(len(Q), 1.1 * np.exp(-0.9 * tau) * (0.5 + 0.5 * s), np.float32), gain=0.8)
            n = int(300 * (0.8 + (3.4 + 0.5 * kind) * tau)) + 200
            a = np.linspace(0, TWO_PI, n, endpoint=False).astype(np.float32); rr = 0.8 + (3.4 + 0.5 * kind) * tau
            P = np.stack([rr * np.cos(a), 0.04 + 0 * a, rr * np.sin(a)], 1)
            add(P, pal(hh + 0.2 + 0 * a, 0.7), np.full(n, (0.55 + 0.3 * kind) * np.exp(-1.2 * tau), np.float32), gain=0.75)

        Xs = np.concatenate(Xs); Ys = np.concatenate(Ys); Cs = np.concatenate(Cs); COL = np.concatenate(COL); WT = np.concatenate(WT)
        margin = 40 * SC
        ok = (Xs > -margin) & (Xs < W + margin) & (Ys > -margin) & (Ys < H + margin)
        Xs, Ys, Cs, COL, WT = Xs[ok], Ys[ok], Cs[ok], COL[ok], WT[ok]
        COLW = COL * WT[:, None]

        def splat(mask, s, wl, hl):
            ix = (Xs[mask] * s).astype(np.int32); iy = (Ys[mask] * s).astype(np.int32)
            m = (ix >= 0) & (ix < wl) & (iy >= 0) & (iy < hl)
            idx = iy[m] * wl + ix[m]; cw = COLW[mask][m]; n = wl * hl
            out = np.empty((hl, wl, 3), np.float32)
            for k in range(3):
                out[..., k] = np.bincount(idx, weights=cw[:, k], minlength=n).reshape(hl, wl)
            return out

        c1, c2, c3 = 1.5 * SC, 5 * SC, 14 * SC
        m0 = Cs < c1; m1 = (Cs >= c1) & (Cs < c2); m2 = (Cs >= c2) & (Cs < c3); m3 = Cs >= c3
        B0 = splat(m0, 1.0, W, H); B0 = cv2.GaussianBlur(B0, (0, 0), 0.75 * SC)
        B1 = splat(m1, 1.0, W, H); B1 = cv2.GaussianBlur(B1, (0, 0), 1.9 * SC)
        w2, h2 = W // 2, H // 2
        B2 = splat(m2, 0.5, w2, h2)
        k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(6 * SC) * 2 + 1,) * 2).astype(np.float32); k2 /= k2.sum()
        B2 = cv2.filter2D(B2, -1, k2); B2 = cv2.resize(B2, (W, H), interpolation=cv2.INTER_LINEAR)
        w4, h4 = W // 4, H // 4
        B3 = splat(m3, 0.25, w4, h4)
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(9 * SC) * 2 + 1,) * 2).astype(np.float32); k3 /= k3.sum()
        B3 = cv2.filter2D(B3, -1, k3); B3 = cv2.resize(B3, (W, H), interpolation=cv2.INTER_LINEAR)
        img = B0 + B1 + B2 * 1.6 + B3 * 2.4

        # ---- sphere (drawn as its own layer, particles add on top)
        ctr = tgt * 0 + np.array([0, 0.0, 0], np.float32); d = ctr - cam
        x = d @ rt2; y = d @ up2; z = d @ f
        cx = W / 2 + fpx * x / z; cy = H / 2 - fpx * y / z; rad = fpx * 0.36 / z * (1 + 0.10 * kick + 0.05 * pul)
        sph = np.zeros((H, W, 3), np.float32)
        if rad > 2:
            x0, x1 = int(max(cx - rad * 1.5, 0)), int(min(cx + rad * 1.5, W)); y0, y1 = int(max(cy - rad * 1.5, 0)), int(min(cy + rad * 1.5, H))
            if x1 > x0 and y1 > y0:
                Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float32)
                u = (X - cx) / rad; v = -(Y - cy) / rad; rr = u * u + v * v
                nz = np.sqrt(np.clip(1 - rr, 0, 1)); L = np.array([-0.45, 0.65, 0.62], np.float32); L /= np.linalg.norm(L)
                Hh = L + np.array([0, 0, 1], np.float32); Hh /= np.linalg.norm(Hh)
                spec = np.clip(u * Hh[0] + v * Hh[1] + nz * Hh[2], 0, 1) ** 70
                fres = (1 - nz) ** 2.4
                env = pal(hue0 + 0.4 * v + 0.2 * u + 0.15, 1.0)
                base = env * (0.05 + 0.55 * fres + 0.28 * (0.5 + 0.5 * v))[..., None] * (0.7 + 1.3 * kick + 0.4 * bass)
                col = base + spec[..., None] * 1.6 + 0.02
                edge = np.clip((1 - np.sqrt(rr)) * rad, 0, 1)[..., None]
                sph[y0:y1, x0:x1] = col * edge
            gx, gy = int(cx / 4), int(cy / 4)
        img = img + sph * 1.4
        # ---- bloom
        q = cv2.resize(img, (w4, h4), interpolation=cv2.INTER_AREA)
        if 0 <= cx < W and 0 <= cy < H:
            yy4, xx4 = np.mgrid[0:h4, 0:w4].astype(np.float32)
            gsz = (14 + 26 * kick + 10 * pul) * SC
            g = np.exp(-(((xx4 - cx / 4) ** 2 + (yy4 - cy / 4) ** 2) / (2 * gsz ** 2)))
            q = q + g[..., None] * pal(hue0 + 0.4, 0.7)[None, None, :] * (0.10 + 0.55 * kick + 0.12 * bass)
        b1 = cv2.GaussianBlur(q, (0, 0), 5 * SC); q8 = cv2.resize(q, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
        b2 = cv2.GaussianBlur(q8, (0, 0), 5 * SC)
        bloom = cv2.resize(b1, (W, H), interpolation=cv2.INTER_LINEAR) * 0.75 + cv2.resize(b2, (W, H), interpolation=cv2.INTER_LINEAR) * 0.9
        img = img + bloom
        # ---- exposure / tone map / grade
        expo = 1.45 * (1 + 1.3 * dropf + 0.3 * kick) * (1 + 0.15 * pul)
        if 15.6 < t < 16.83 or 32.0 < t < 33.11: expo *= 0.85
        img = 1 - np.exp(-expo * img)
        img = img * self.vig
        # radial chromatic aberration
        M = lambda s: np.float32([[s, 0, (1 - s) * W / 2], [0, s, (1 - s) * H / 2]])
        img[..., 0] = cv2.warpAffine(img[..., 0], M(1.004), (W, H)); img[..., 2] = cv2.warpAffine(img[..., 2], M(0.996), (W, H))
        out = img ** (1 / 1.12) * 255.0 + self.grain[i % 3]
        out = np.clip(out, 0, 255)
        if with_text:
            for key, al in zip(('hook', 'end'), self.text_alpha(t)):
                if al > 0.003:
                    T = self.texts[key]; y0, y1, x0, x1 = T['box']
                    dy = int(18 * SC * (1 - al))
                    reg = out[y0:y1, x0:x1]
                    reg *= (1 - T['sh'] * 0.55 * al)[..., None]
                    reg[:] = reg * (1 - T['a'] * al)[..., None] + 255 * (T['a'] * al)[..., None]
        return out.astype(np.uint8)


def encode_full(out_path, limit=None):
    sc = Scene(); n = sc.nfr if limit is None else limit
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', MP3, '-map', '0:v', '-map', '1:a', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
           '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M', '-profile:v', 'high',
           '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart',
           '-c:a', 'aac', '-b:a', '192k', '-shortest', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for i in range(n):
        fr = sc.render(i / FPS)
        p.stdin.write(fr.tobytes())
        if i % 30 == 0:
            el = time.time() - t0
            print(f'frame {i}/{n}  elapsed {el:.0f}s  eta {el / max(i, 1) * (n - i):.0f}s', flush=True)
    p.stdin.close(); p.wait(); print('DONE', time.time() - t0, flush=True)


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'test':
        ts = [float(x) for x in sys.argv[2].split(',')]
        sc = Scene(); tiles = []
        for t in ts:
            t0 = time.time(); fr = sc.render(t); print(f't={t}: {time.time() - t0:.2f}s', flush=True)
            cv2.putText(fr, f'{t:.2f}s', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 0), 2)
            tiles.append(fr)
        cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
        rows = (len(tiles) + cols - 1) // cols
        th, tw = tiles[0].shape[:2]; sheet = np.zeros((rows * th, cols * tw, 3), np.uint8)
        for k, tl in enumerate(tiles): sheet[(k // cols) * th:(k // cols + 1) * th, (k % cols) * tw:(k % cols + 1) * tw] = tl
        Image.fromarray(sheet).save(sys.argv[4] if len(sys.argv) > 4 else os.path.join(HERE, 'test_sheet.jpg'), quality=88)
    elif mode == 'full':
        encode_full(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
