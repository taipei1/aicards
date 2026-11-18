from types import SimpleNamespace

from app.services.phrase_service import (
    PhraseService,
    card_source_hash,
    front_units,
    has_cyrillic,
    max_phrase_words,
    placeholder_swap_is_safe,
    required_units,
    word_count,
)


def card(front="hlava", back="голова", hint=None, language="sk", card_id=1):
    return SimpleNamespace(
        id=card_id,
        front=front,
        back=back,
        hint=hint,
        language=language,
    )


def test_word_count_handles_hyphen_and_punctuation():
    assert word_count("take off your shoes") == 4
    assert word_count("take-off") == 1
    assert word_count("  bolesť   hlavy. ") == 2


def test_has_cyrillic():
    assert has_cyrillic("снять обувь")
    assert not has_cyrillic("take off your shoes")


def test_source_hash_changes_with_back_or_hint():
    base = card()
    assert card_source_hash(base) == card_source_hash(card())
    assert card_source_hash(base) != card_source_hash(card(back="башка"))
    assert card_source_hash(base) != card_source_hash(card(hint="разговорное"))


def test_parse_batch_accepts_fenced_array():
    text = """```json
    [
      {"id": 1, "phrase": "bolesť hlavy", "translation": "боль головы",
       "target_spans": ["hlavy"], "translation_spans": ["головы"],
       "target_lemma": "hlava"}
    ]
    ```"""
    parsed = PhraseService.parse_batch(text)
    assert 1 in parsed
    assert parsed[1]["phrase"] == "bolesť hlavy"
    assert parsed[1]["target_spans"] == ["hlavy"]


def test_parse_batch_recovers_objects_from_broken_tail():
    text = (
        '{"phrases": ['
        '{"id": 1, "phrase": "bolesť hlavy", "translation": "боль головы",'
        ' "target_spans": ["hlavy"], "translation_spans": ["головы"]},'
        '{"id": 2, "phrase": "silná hlava", "translation": "сильная голова",'
        ' "target_spans": ["hlava"], "translation_spans": ["голова"]}'
        # deliberately missing closing brackets
    )
    parsed = PhraseService.parse_batch(text)
    assert set(parsed) == {1, 2}


def test_validate_accepts_inflected_form_and_highlights_actual_slice():
    service = PhraseService()
    item = {
        "phrase": "Bolesť hlavy",
        "translation": "Боль головы",
        "target_spans": ["hlavy"],
        "translation_spans": ["головы"],
        "target_lemma": "hlava",
    }
    assert service.validate_item(card(), item, "sk") == ""
    # The stored span preserves the phrase's capitalisation, not the model's.
    assert item["target_spans"] == ["hlavy"]
    assert item["phrase"] == "Bolesť hlavy"


def test_validate_accepts_separable_phrasal_verb():
    service = PhraseService()
    item = {
        "phrase": "take your shoes off",
        "translation": "сними обувь",
        "target_spans": ["take", "off"],
        "translation_spans": ["сними"],
        "target_lemma": "take off",
    }
    assert service.validate_item(card("take off", "снимать", language="en"), item, "en") == ""


def test_validate_accepts_one_variant_of_an_aspect_pair():
    service = PhraseService()
    item = {
        "phrase": "chcem vytvoriť nový projekt",
        "translation": "я хочу создать новый проект",
        "target_spans": ["vytvoriť"],
        "translation_spans": ["создать"],
        # The model may copy just the chosen aspect variant.
        "target_lemma": "vytvoriť",
    }
    assert service.validate_item(
        card("vytvárať / vytvoriť", "создавать / создать"), item, "sk"
    ) == ""


def test_validate_rejects_partial_multiword_card():
    service = PhraseService()
    item = {
        "phrase": "take your shoes off",
        "translation": "сними обувь",
        "target_spans": ["take"],
        "translation_spans": ["сними"],
        "target_lemma": "take off",
    }
    assert "cover" in service.validate_item(
        card("take off", "снимать", language="en"), item, "en"
    )


def test_validate_allows_two_context_words_for_a_multiword_card():
    service = PhraseService()
    item = {
        "phrase": "Kost sa láme pri páde",
        "translation": "Кость ломается при падении",
        "target_spans": ["Kost sa láme"],
        "translation_spans": ["Кость ломается"],
        "target_lemma": "Kost sa láme.",
    }
    assert service.validate_item(
        card("Kost sa láme.", "Кость ломается."), item, "sk"
    ) == ""


def test_required_units_excludes_only_replaceable_placeholders():
    assert front_units("Nefunguje mi to.") == 3
    assert required_units("Nefunguje mi to.", "sk") == 2
    assert required_units("vzhľadom na to, že", "sk") == 3
    assert required_units("take it easy", "en") == 2
    # A placeholder in the short card is still part of the expression.
    assert required_units("take off", "en") == 2


def test_expression_core_drops_dictionary_notes():
    # Grammar notes are not words the phrase has to contain.
    assert front_units("pripraviť sa na + Acc", "sk") == 3
    assert front_units("daviť sa (нет совершенного)", "sk") == 2
    # English dictionaries write infinitives with `to` and nouns with articles.
    assert front_units("to bring", "en") == 1
    assert max_phrase_words("to bring", "en") == 4
    assert front_units("a cooker", "en") == 1
    assert front_units("an entrance", "en") == 1
    # The article stays when it is part of a longer expression.
    assert front_units("the number of", "en") == 3
    assert front_units("The bomb exploded", "en") == 3


def test_slash_inside_a_sentence_is_not_a_variant_separator():
    # `vás/ťa` are alternatives for one slot, not two versions of the sentence.
    front = "Môžem sa vás/ťa na niečo spýtať/opýtať?"
    assert front_units(front, "sk") == 6
    assert required_units(front, "sk") == 6
    assert max_phrase_words(front, "sk") == 9
    assert front_units("vytvárať / vytvoriť", "sk") == 1
    assert front_units("hore/dole", "sk") == 1


def test_placeholder_swap_guard_keeps_grammar_sensitive_sentences():
    assert placeholder_swap_is_safe("Nefunguje mi to.", "sk")
    assert placeholder_swap_is_safe("brať to vážne", "sk")
    assert not placeholder_swap_is_safe("To je presne ono.", "sk")
    assert not placeholder_swap_is_safe("Podarilo sa mi to.", "sk")
    assert not placeholder_swap_is_safe("Stalo sa to včera.", "sk")
    # English past tense does not agree with the subject, so it is safe.
    assert placeholder_swap_is_safe("I made it yesterday", "en")


def test_validate_rejects_unsafe_placeholder_swap():
    service = PhraseService()
    predicate = {
        "phrase": "To je presne riešenie.",
        "translation": "Это точно решение.",
        "target_spans": ["To je presne"],
        "translation_spans": ["Это точно"],
        "target_lemma": "To je presne ono.",
    }
    assert "needs 4" in service.validate_item(
        card("To je presne ono.", "Это точно то."), predicate, "sk"
    )

    neuter_past = {
        "phrase": "Podarilo sa mi skúška.",
        "translation": "У меня получилась проба.",
        "target_spans": ["Podarilo sa mi"],
        "translation_spans": ["У меня"],
        "target_lemma": "Podarilo sa mi to.",
    }
    assert "needs 4" in service.validate_item(
        card("Podarilo sa mi to.", "У меня это получилось."), neuter_past, "sk"
    )


def test_validate_accepts_concretized_multiword_card():
    service = PhraseService()
    item = {
        "phrase": "Nefunguje mi počítač.",
        "translation": "У меня не работает компьютер.",
        "target_spans": ["Nefunguje mi"],
        "translation_spans": ["не работает"],
        "target_lemma": "Nefunguje mi to.",
    }
    assert service.validate_item(
        card("Nefunguje mi to.", "У меня это не работает."), item, "sk"
    ) == ""
    assert item["target_spans"] == ["Nefunguje mi"]


def test_validate_accepts_multiword_placeholder_swap_with_several_spans():
    service = PhraseService()
    item = {
        "phrase": "take things easy",
        "translation": "относись к вещам проще",
        "target_spans": ["take", "easy"],
        "translation_spans": ["относись", "проще"],
        "target_lemma": "take it easy",
    }
    assert service.validate_item(
        card("take it easy", "относиться проще", language="en"), item, "en"
    ) == ""


def test_validate_accepts_fixed_expression_when_placeholder_is_kept():
    service = PhraseService()
    item = {
        "phrase": "vzhľadom na to, že prší",
        "translation": "учитывая, что идёт дождь",
        "target_spans": ["vzhľadom na to, že"],
        "translation_spans": ["учитывая, что"],
        "target_lemma": "vzhľadom na to, že",
    }
    assert service.validate_item(
        card("vzhľadom na to, že", "учитывая, что"), item, "sk"
    ) == ""


def test_validate_rejects_concretization_that_drops_the_core():
    service = PhraseService()
    item = {
        "phrase": "Nefunguje mi.",
        "translation": "У меня не работает.",
        "target_spans": ["Nefunguje mi"],
        "translation_spans": ["не работает"],
        "target_lemma": "Nefunguje mi to.",
    }
    assert "card has 3" in service.validate_item(
        card("Nefunguje mi to.", "У меня это не работает."), item, "sk"
    )

    partial = dict(
        item,
        phrase="Nefunguje mi počítač.",
        translation="У меня не работает компьютер.",
        target_spans=["Nefunguje"],
    )
    assert "needs 2" in service.validate_item(
        card("Nefunguje mi to.", "У меня это не работает."), partial, "sk"
    )


def test_build_prompt_explains_concretization_and_word_limit():
    prompt = PhraseService().build_prompt(
        [card("Nefunguje mi to.", "У меня это не работает.")], "sk"
    )
    assert "Nefunguje mi počítač" in prompt
    assert "To je presne ono riešenie" in prompt
    assert '"max_words": 6' in prompt


def test_max_words_fits_the_context_example_from_the_prompt():
    # The prompt itself suggests this fallback for grammar-sensitive cards;
    # validation must not reject its own example.
    assert word_count("To je presne ono, čo som hľadal.") <= max_phrase_words(
        "To je presne ono."
    )
    assert word_count("Podarilo sa mi to na prvý pokus.") <= max_phrase_words(
        "Podarilo sa mi to."
    )
    assert max_phrase_words("hlava") == 4
    assert max_phrase_words("take off") == 4
    assert max_phrase_words("Nefunguje mi to.") == 6


def test_build_prompt_keep_whole_retry_note():
    prompt = PhraseService().build_prompt(
        [card("To je presne ono.", "Это точно то.")],
        "sk",
        strict=True,
        keep_whole=True,
    )
    assert "НЕ переигрывай" in prompt
    assert "верни WORD целиком" in prompt


def test_validate_requires_a_whole_word_match():
    service = PhraseService()
    item = {
        "phrase": "start a business",
        "translation": "начать бизнес",
        "target_spans": ["art"],
        "translation_spans": ["бизнес"],
        "target_lemma": "art",
    }
    assert "not in phrase" in service.validate_item(
        card("art", "искусство", language="en"), item, "en"
    )


def test_validate_rejects_too_long_phrase():
    service = PhraseService()
    item = {
        "phrase": "one two three four five",
        "translation": "один два три четыре пять",
        "target_spans": ["one"],
        "translation_spans": ["один"],
        "target_lemma": "one",
    }
    assert "max 4" in service.validate_item(card("one", "один", language="en"), item, "en")


def test_validate_rejects_missing_span_and_wrong_lemma():
    service = PhraseService()
    base = {
        "phrase": "bolesť hlavy",
        "translation": "боль головы",
        "target_spans": ["hlavy"],
        "translation_spans": ["головы"],
        "target_lemma": "hlava",
    }
    missing = dict(base, target_spans=["rukavice"])
    assert "not in phrase" in service.validate_item(card(), missing, "sk")

    wrong_lemma = dict(base, target_lemma="ruka")
    assert "does not match" in service.validate_item(card(), wrong_lemma, "sk")


def test_validate_rejects_cyrillic_target_and_non_russian_translation():
    service = PhraseService()
    item = {
        "phrase": "болит голова",
        "translation": "боль головы",
        "target_spans": ["голова"],
        "translation_spans": ["головы"],
        "target_lemma": "hlava",
    }
    assert "studied language" in service.validate_item(card(), item, "sk")

    no_russian = dict(item, phrase="bolesť hlavy", translation="head pain",
                      target_spans=["hlavy"], translation_spans=["pain"])
    assert "not Russian" in service.validate_item(card(), no_russian, "sk")


def test_enqueue_deduplicates_and_chunks_priority_batch():
    service = PhraseService()
    assert service.enqueue([1, 2, 3, 4, 5, 6], priority=0) == 6
    assert service.enqueue([1, 2, 7], priority=1) == 1
    assert service.enqueue([1, 2, 7], priority=1) == 0
    assert service.pending([1, 2, 7]) == [1, 2, 7]
