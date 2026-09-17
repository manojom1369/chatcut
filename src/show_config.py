"""
show_config.py — lyric sheet, timing map and art direction for the 9:16 render.

Song   : "Manasa Nuvvunde Chote" — film Munna (2007), music Mani Sharma
Content: the charanam supplied by the client, split into phone-readable 9:16 lyric cards
         and placed on a 90 BPM / 20-frames-per-beat grid (easy to re-time for the real track).

Timing is expressed in BEATS so the whole show can be slid onto the real song's tempo by
changing BPM alone. Every card duration is a whole or half beat.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# --------------------------------------------------------------------------------------
# Global show settings
# --------------------------------------------------------------------------------------
BPM = 90
FPS = 30
WIDTH = 1080
HEIGHT = 1920                      # 9:16
BEAT = 60.0 / BPM                  # seconds

# 9:16 safe zones, per the master prompt (percent of frame height)
PRIME_TOP, PRIME_BOTTOM = 0.12, 0.62    # hero/heroine faces live here — keep it clear
TEXT_BAND_TOP = 0.60                    # nothing above this line may carry type
DEAD_BOTTOM = 0.75                      # platform UI starts here
LYRIC_CENTER = 0.655                    # main Telugu line centre (clear of the faces above)
LATIN_CENTER = 0.718                    # transliteration line centre


@dataclass
class Card:
    telugu: str
    latin: str
    meaning: str
    start_beat: float
    beats: float
    section: str = "A"          # backdrop / palette family
    anim: str = "rise"          # in-animation preset
    keyword: str | None = None  # Telugu substring given the signature emphasis move
    size: int = 84              # Telugu type size in px
    kwargs: dict = field(default_factory=dict)

    @property
    def start_frame(self) -> int:
        return int(round(self.start_beat * BEAT * FPS))

    @property
    def frames(self) -> int:
        return int(round(self.beats * BEAT * FPS))

    @property
    def end_frame(self) -> int:
        return self.start_frame + self.frames


TITLE = Card(
    telugu="మనసా నువ్వుండే చోటే",
    latin="MANASA NUVVUNDE CHOTE",
    meaning="O heart, the place where you live",
    start_beat=0,
    beats=6,
    section="A",
    anim="title",
    size=94,
    kwargs={"note": "Munna · Mani Sharma · 9:16"},
)

CARDS: list[Card] = [
    # ---- Section A : the confession -------------------------------------------------
    Card("నీవే తోడని నిజంగా", "Neeve thodani nijamga",
         "You are my companion, truly", 6, 4, "A", "rise", "నిజంగా", 108),
    Card("నీలో చేరితి క్రమంగా", "Neelo cherithi kramamga",
         "I merged into you, slowly", 10, 4, "A", "rise", "క్రమంగా", 106),
    Card("నీవుంటే ఒక యుగమే", "Neevunte oka yugame",
         "With you, an age", 14, 4, "A", "rise", "యుగమే", 100),
    Card("అయిపోయే ఇక క్షణమే", "Ayipoye ika kshaname",
         "passes like a single moment", 18, 4, "A", "rise", "క్షణమే", 96),

    # ---- Section B : the turn -------------------------------------------------------
    Card("తెలుసా తెలుసా", "Telusa telusa",
         "Do you know?", 22, 4, "B", "wipe", "తెలుసా", 132),
    Card("ఇది తెలుసా", "Idhi telusa",
         "Do you know this?", 26, 3, "B", "wipe", "తెలుసా", 118),
    Card("మార్చేసావే నా ఈ వరసా", "Maarchesaave naa ee varasa",
         "You rewrote my destiny", 29, 4, "B", "rise", "మార్చేసావే", 88),
    Card("నువ్వు మార్చేసావే నా ఈ వరసా", "Nuvvu maarchesaave naa ee varasa",
         "You rewrote my destiny", 33, 4, "B", "rise", "మార్చేసావే", 72),

    # ---- Section C : the chorus -----------------------------------------------------
    Card("ఓ సోనా వెన్నెల సోనా", "O sona vennelasona",
         "O golden moonlight", 37, 4, "C", "pop", "సోనా", 96),
    Card("రేపావే అల్లరి జాన", "Raapaave allari jaana",
         "Come to me, mischievous one", 41, 4, "C", "rise", "అల్లరి", 106),
    Card("చెక్కిల్లో చుక్కైపోనా", "Chekkillo chukkaipona",
         "Shall I become a mark on your cheek", 45, 4, "C", "stagger", "చుక్కైపోనా", 100),
    Card("చూపుల్తో చుట్టేసేయ్నా", "Choopultho chutteseyna",
         "Wrap me in your glances", 49, 4, "C", "stagger", "చుట్టేసేయ్నా", 90),
    Card("ఓ సోనా వెన్నెల సోనా", "O sona vennelasona",
         "O golden moonlight", 53, 4, "C", "pop", "సోనా", 96),
    Card("ముంగిట్లో ముగ్గైరానా", "Mungitlo muggairana",
         "Shall I come as a rangoli to your door", 57, 4, "C", "stagger", "ముగ్గైరానా", 98),
    Card("ముద్దుల్తో ముంచేసేయ్నా", "Muddultho muncheseyna",
         "Drown me in kisses", 61, 4, "C", "pop", "ముద్దుల్తో", 86),
    Card("కౌగిళికే", "Kougilike",
         "into the embrace", 65, 3, "C", "title", "కౌగిళికే", 150),
]

END = Card(
    telugu="ఓ సోనా వెన్నెల సోనా",
    latin="O SONA VENNELASONA",
    meaning="",
    start_beat=68,
    beats=6,
    section="A",
    anim="title",
    size=90,
    kwargs={"note": "9:16 · 1080×1920"},
)

SHOW: list[Card] = [TITLE, *CARDS, END]

TOTAL_BEATS = max(c.start_beat + c.beats for c in SHOW)
TOTAL_FRAMES = int(round(TOTAL_BEATS * BEAT * FPS))

# --------------------------------------------------------------------------------------
# Art direction per section — palettes follow the master prompt's cinematic palettes
# --------------------------------------------------------------------------------------
SECTIONS: dict[str, dict] = {
    # warm amber romance: golden hour, dust motes, sun leak
    "A": dict(
        name="warm amber romance",
        sky=((18, 12, 16), (92, 44, 22), (168, 96, 44), (214, 156, 84)),
        bokeh=((255, 196, 120), (255, 168, 84), (255, 224, 180), (240, 140, 60)),
        bokeh_count=26,
        leak=(255, 196, 128),
        leak_strength=0.17,
        particles="dust",
        particle_count=70,
        vignette=0.52,
        text=((252, 246, 234), (255, 232, 198)),
        keyword=((255, 214, 132), (255, 176, 72)),
        glow=(255, 178, 92),
        latin=(232, 208, 176),
        scrim=0.18,
    ),
    # desaturated moody: the emotional turn, cooler and tighter
    "B": dict(
        name="desaturated moody",
        sky=((7, 9, 14), (18, 25, 36), (44, 52, 64), (78, 84, 92)),
        bokeh=((150, 186, 214), (196, 210, 226), (110, 140, 170), (236, 226, 210)),
        bokeh_count=16,
        leak=(180, 200, 224),
        leak_strength=0.13,
        particles="rain",
        particle_count=90,
        vignette=0.62,
        text=((238, 244, 250), (206, 220, 236)),
        keyword=((226, 240, 255), (150, 196, 246)),
        glow=(140, 186, 236),
        latin=(186, 202, 220),
        scrim=0.34,
    ),
    # night neon: chorus energy, magenta/teal, falling petals
    "C": dict(
        name="night neon",
        sky=((10, 8, 24), (34, 14, 58), (86, 22, 78), (24, 58, 92)),
        bokeh=((255, 96, 190), (96, 226, 255), (255, 150, 92), (196, 128, 255)),
        bokeh_count=30,
        leak=(255, 120, 200),
        leak_strength=0.15,
        particles="petals",
        particle_count=26,
        vignette=0.58,
        text=((255, 248, 252), (255, 220, 240)),
        keyword=((255, 214, 150), (255, 132, 176)),
        glow=(255, 110, 186),
        latin=(236, 200, 232),
        scrim=0.18,
    ),
}
