"""Render original combat sounds. Requires NumPy, SciPy and FFmpeg.

Run from any directory: python tools/make_combat_sfx.py
The game plays the rendered one-shots; no synthesis runs on the game loop.
"""
from pathlib import Path
import subprocess

import numpy as np
from scipy import signal


RATE = 44100
OUT = Path(__file__).resolve().parents[1] / "assets/sfx/combat-v1"


class Cue:
    def __init__(self, duration, seed):
        self.mix = np.zeros(round(duration * RATE))
        self.rng = np.random.default_rng(seed)

    def add(self, samples, at=0):
        start = round(at * RATE)
        n = min(len(samples), len(self.mix) - start)
        if n > 0:
            self.mix[start:start + n] += samples[:n]

    def burst(self, at, dur, low, high, level, decay=5, attack=.001):
        t = np.arange(round(dur * RATE)) / RATE
        raw = self.rng.standard_normal(len(t))
        sos = signal.butter(2, [low, high], fs=RATE, btype="bandpass", output="sos")
        band = signal.sosfilt(sos, raw)
        band /= np.sqrt(np.mean(band * band)) + 1e-8
        self.add(level * band * (1 - np.exp(-t / attack)) * np.exp(-decay * t / dur), at)

    def resonance(self, at, dur, modes, level, decay=7):
        t = np.arange(round(dur * RATE)) / RATE
        resonances = sum(np.sin(2 * np.pi * f * t) / (1 + .6 * i)
                         for i, f in enumerate(modes))
        self.add(level * resonances * (1 - np.exp(-t / .0015)) * np.exp(-decay * t / dur), at)

    def reflections(self, amount):
        direct = self.mix[:round(.19 * RATE)].copy()
        for delay, gain, cutoff in [(.037, .20, 4800), (.071, .14, 3300),
                                    (.119, .12, 2200), (.181, .09, 1500),
                                    (.256, .05, 1150)]:
            reflected = signal.sosfilt(signal.butter(2, cutoff, fs=RATE, output="sos"), direct)
            self.add(reflected * gain * amount, delay * self.rng.uniform(.87, 1.17))

    def grit(self, start, end, count, level, bands=(350, 4100)):
        for at in sorted(self.rng.uniform(start, end, count)):
            fade = 1 - .78 * (at - start) / (end - start)
            lo, hi = bands
            self.burst(at, self.rng.uniform(.015, .13), lo * self.rng.uniform(.7, 1.3),
                       hi * self.rng.uniform(.7, 1.3), self.rng.uniform(.2, 1) * level * fade)

    def pcm(self, peak):
        y = signal.sosfilt(signal.butter(2, 27, fs=RATE, btype="highpass", output="sos"), self.mix)
        y = np.tanh(y * 1.8)
        y[-882:] *= np.linspace(1, 0, 882)
        return (32767 * peak * y / max(np.max(np.abs(y)), .0001)).astype("<i2").tobytes()


# duration, powder weight, mechanical weight, noise brightness, early reflections
WEAPONS = {
    "shoot_rifle": (.37, .35, .16, 9100, .88),
    "shoot_heli":  (.39, .54, .28, 6800, .65),
    "shoot_jet":   (.46, .68, .26, 5200, .58),
    "shoot_tank":  (.72, .93, .31, 4600, 1.20),
    "shoot_mech":  (.57, .75, .52, 5600, .96),
    "shoot_boss":  (.92, 1.2, .39, 3900, 1.32),
}


def weapon(c, name):
    dur, weight, metal, bright, room = WEAPONS[name]
    c.burst(0, .024, 1350, bright, .62 - .18 * weight, 7, .00018)
    c.burst(0, .045 + .05 * weight, 130, 1700, .32 + .21 * weight, 5, .00055)
    c.burst(.001, .07 + .24 * weight, 39, 245, .13 + .37 * weight, 5)
    c.burst(.006, dur * .73, 70, 660, .04 + .13 * weight, 5, .004)
    c.resonance(.002, .09 + weight * .16, [120 - 51 * weight, 193 - 64 * weight], .18 * weight)
    c.burst(.021, .038, 900, 5900, metal * .47)
    c.resonance(.035, .1, [738, 1517, 2281], metal * .19)
    c.reflections(room)


# duration, shock weight, metal weight, amount of falling material
IMPACTS = {
    "hit":             (.24, .37, .37, 2),
    "shell_hit":       (.40, .62, .68, 4),
    "melee_punch":     (.36, .65, .15, 2),
    "melee_dropkick":  (.53, .88, .27, 4),
    "melee_slam":      (.98, 1.2, .37, 15),
    "stomp":           (.69, .97, .04, 9),
    "car_crush":       (.58, .67, 1.0, 10),
    "collapse":       (1.75, 1.16, .42, 32),
    "explosion_small": (.78, .87, .32, 10),
    "explosion_big":  (1.36, 1.2, .36, 17),
    "atomic_blast":   (2.05, 1.46, .29, 21),
    "energy_impact":   (.71, .90, .53, 10),
}


def impact(c, name):
    dur, weight, metal, rubble = IMPACTS[name]
    c.burst(0, .021 + .02 * weight, 550, 4600 + metal * 4700, .22 + metal * .32, 6, .0004)
    c.burst(0, .10 + .14 * weight, 85, 930, .28 + .13 * weight, 5)
    c.burst(.004, dur * .8, 31, 186, .22 * weight, 5, .005)
    f = (117 - 43 * weight) * c.rng.uniform(.91, 1.09)
    c.resonance(.003, .2 + weight * .26, [f, f * 1.51, f * 2.39], weight * .18)
    c.resonance(.009, dur * .65, [394, 701, 1121, 1897], metal * .16)
    if name in ("collapse", "melee_slam", "atomic_blast"):
        for at, scale in [(.072, .85), (.158, .63), (.31, .44)]:
            c.burst(at, dur * .52, 56, 860, scale * .26, 5, .003)
    c.grit(.024, dur * .85, rubble, .20 + .15 * metal)
    c.reflections(.75 + .2 * weight)


BEAMS = {
    "beam_gorrak": (.98, 55, 2100, .19),
    "beam_tridon": (.86, 89, 6500, .35),
    "beam_mechra": (.74, 73, 3600, .53),
}


def beam(c, name):
    dur, root, bright, metal = BEAMS[name]
    c.burst(0, .045, 380, bright, .50, 5)
    c.burst(.004, dur, 90, bright, .25, 3.8, .008)
    c.burst(.007, dur, 30, 220, .39, 4.7, .006)
    c.resonance(.003, dur, [root, root * 1.92, root * 3.21], .20, 5)
    c.resonance(.015, dur * .69, [417, 733, 1248], metal * .28, 5)
    c.grit(.011, dur * .72, 15, .25 + metal * .33, (420, bright))
    c.reflections(1)


def charge(c, _name):
    t = np.arange(len(c.mix)) / RATE
    progress = t / t[-1]
    surge = progress ** 1.5 * np.minimum(1, (1 - progress) * 35)
    phase = 2 * np.pi * (43 * t + 31 * t * progress)
    c.burst(0, .4, 35, 360, .24, .5, .10)
    c.burst(.10, .30, 180, 1900, .14, .5, .15)
    c.add(surge * (.55 * np.sin(phase) + .22 * np.sin(phase * 2.16)
                   + .12 * np.sin(phase * 4.31)))
    c.mix *= np.minimum(1, (1 - progress) * 35)


def render():
    OUT.mkdir(parents=True, exist_ok=True)
    bank = [(WEAPONS, weapon, 3, .83), (IMPACTS, impact, 2, .85),
            (BEAMS, beam, 2, .87), ({"atomic_charge": (.4,)}, charge, 2, .65)]
    for group, make, count, peak in bank:
        for index, (name, profile) in enumerate(group.items()):
            for variation in range(1, count + 1):
                cue = Cue(profile[0], 99201 + index * 71 + variation * 13)
                make(cue, name)
                pcm = cue.pcm(peak)
                for ext, codec, options in [("ogg", "libvorbis", ["-q:a", "3"]),
                                            ("mp3", "libmp3lame", ["-b:a", "80k"])]:
                    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le",
                                    "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
                                    "-map_metadata", "-1", "-c:a", codec, *options,
                                    str(OUT / f"{name}_{variation}.{ext}")], input=pcm, check=True)


if __name__ == "__main__":
    render()
