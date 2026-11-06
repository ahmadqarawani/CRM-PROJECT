import re

import phonenumbers

_TASHKEEL = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_LETTERS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
# titles that must not decide whether two names are the same person
_TITLES = re.compile(r"^(?:م|د|ا|أ)\.\s*|^(?:المهندس|المهندسه|مهندس|الدكتور|الدكتوره|دكتور|الاستاذ|استاذ|الحاج|الحاجه|مدام|السيد|السيده)\s+")
_INVISIBLE = re.compile(r"[‎‏‪-‮⁦-⁩ ]")


def normalize_ar(text: str | None) -> str:
    """Fold Arabic spelling variants: 'احمد' == 'أحمد', 'مدرسة' == 'مدرسه'."""
    if not text:
        return ""
    text = _INVISIBLE.sub(" ", text)
    text = _TASHKEEL.sub("", text).translate(_LETTERS).translate(_DIGITS)
    return " ".join(text.lower().split())


def name_key(name: str | None) -> str:
    """Comparison key for duplicate detection (the stored name is never changed)."""
    s = normalize_ar(name)
    for _ in range(2):
        s = _TITLES.sub("", s).strip()
    s = re.sub(r"\bعبد\s+ال", "عبدال", s)   # عبد الله == عبدالله
    s = re.sub(r"\bابو\s+", "ابو", s)        # ابو محمد == ابومحمد
    s = re.sub(r"\bام\s+", "ام", s)
    return s.replace(" ", "")


def normalize_phone(raw: str | None, region: str = "SY") -> str | None:
    """E.164 ('+963933418288'). 0933…, 933…, 00963 933… and +963-933… are the same number.
    Long numbers without a + are treated as international (as typed in the old sheets).
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
        elif len(digits) >= 11 and not digits.startswith("0"):
            candidates = ["+" + digits, raw]
    for c in candidates:
        try:
            n = phonenumbers.parse(c, region)
        except phonenumbers.NumberParseException:
            continue
        if phonenumbers.is_valid_number(n):
            return phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.E164)
    return None
