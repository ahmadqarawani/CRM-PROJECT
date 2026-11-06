import re

import phonenumbers

_TASHKEEL = re.compile("[" + "".join(f"{chr(a)}-{chr(b)}" for a, b in [(0x0610, 0x061A), (0x064B, 0x065F), (0x0670, 0x0670), (0x06D6, 0x06ED), (0x0640, 0x0640)]) + "]")
_LETTERS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
# bidi marks / isolates / nbsp that phones copied from WhatsApp carry
_INVISIBLE_CHARS = "".join(map(chr, [0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A), 0xA0]))
_INVISIBLE = re.compile(f"[{_INVISIBLE_CHARS}]")
# titles that must not decide whether two names are the same person (matched on normalized text)
_TITLES = re.compile(
    r"^(?:م|د|ا)\.\s*"
    r"|^(?:المهندس|المهندسه|مهندس|الدكتور|الدكتوره|دكتور|الاستاذ|استاذ|الحاج|الحاجه|مدام|السيد|السيده)\s+"
)


def normalize_ar(text: str | None) -> str:
    """Fold Arabic spelling variants: 'احمد' == 'أحمد', 'مدرسة' == 'مدرسه'."""
    if not text:
        return ""
    text = _INVISIBLE.sub(" ", text)
    text = _TASHKEEL.sub("", text).translate(_LETTERS).translate(_DIGITS)
    return " ".join(text.lower().split())


def name_words(name: str | None) -> list[str]:
    """Normalized words without titles; 'عبد الله' and 'ابو محمد' count as one word each."""
    s = normalize_ar(name)
    for _ in range(2):
        s = _TITLES.sub("", s).strip()
    s = re.sub(r"\bعبد\s+ال", "عبدال", s)  # عبد الله == عبدالله
    s = re.sub(r"\b(ابو|ام)\s+", r"\1", s)  # ابو محمد == ابومحمد
    return s.split()


def name_key(name: str | None) -> str:
    """Comparison key for duplicate detection (the stored name is never changed)."""
    return "".join(name_words(name))


def normalize_phone(raw: str | None, region: str = "SY") -> str | None:
    """E.164 ('+963933418288'). 0933…, 933…, 00963 933… and +963-933… are the same number.
    Numbers of 10+ digits typed without '+' (as in the old sheets) are treated as international.
    Returns None when nothing usable is left."""
    if not raw:
        return None
    raw = _INVISIBLE.sub("", raw.translate(_DIGITS)).strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    candidates = [raw]
    if not raw.startswith("+"):
        if digits.startswith("00"):
            candidates = ["+" + digits[2:]]
        elif digits.startswith("963"):
            candidates = ["+" + digits]
        elif len(digits) >= 10 and not digits.startswith("0"):  # foreign number typed without "+"
            candidates = ["+" + digits, raw]
    for c in candidates:
        try:
            n = phonenumbers.parse(c, region)
        except phonenumbers.NumberParseException:
            continue
        if phonenumbers.is_valid_number(n):
            return phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.E164)
    return None
