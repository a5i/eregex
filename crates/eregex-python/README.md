# eregex (Python bindings)

Python bindings for [`eregex`](https://github.com/a5i/eregex) — an
advanced regular expression engine for Rust inspired by mrab-regex (the Python
`regex` module).

This package exposes eregex's full API to Python via [PyO3](https://pyo3.rs)
and ships as a wheel built with [maturin](https://www.maturin.rs). All
matching logic runs in compiled Rust; the Python layer is a thin adapter.

## Features

- Named groups, duplicate group names, **repeated captures**
- Greedy / lazy / possessive quantifiers, atomic groups `(?>...)`
- Variable-length lookbehind / lookahead
- Inline scoped flags `(?i)`, `(?i-m:...)`
- Backreferences `\1`, `\g<name>`, `(?P=name)`
- **Partial / end-anchored matching** (`find_partial`)
- `find`, `match_at_start` (Python `re.match`), `fullmatch` (`re.fullmatch`)
- `replace`, `replace_all` with `$1` / `${name}` / `$$` templates
- `split`, `escape`, and more

## Installation

The wheel is built from the Rust core:

```bash
cd crates/eregex-python
python -m venv .venv
. .venv/bin/activate          # or .venv\Scripts\activate on Windows
pip install maturin
maturin develop --release     # editable install into the current venv
# or: maturin build --release && pip install target/wheels/eregex-*.whl
```

`maturin develop` installs an `import eregex` module into the active virtual
environment (the extension is named `eregex`).

## Quick start

```python
import eregex

re = eregex.Regex(r"(\w+)\s+(\w+)")
m = re.find("hello world")
m.matched        # 'hello world'
m.group(1)       # 'hello'
m.group(2)       # 'world'
m[1]             # 'hello'  (Match is sequence-like)

# Flags: pass a bitset of the module-level constants, or parse a string.
eregex.Regex("hello", eregex.IGNORECASE).is_match("HELLO")  # True
eregex.Regex("hello", eregex.parse_flags("i")).is_match("HELLO")  # True

# Repeated captures (signature mrab-regex feature).
eregex.Regex(r"(\w)+").find("abc").captures(1)  # ['a', 'b', 'c']

# Replace with named groups.
eregex.Regex(r"(?P<a>\d)(?P<b>\d)").replace_all("12 34", "${b}${a}")  # '21 43'
```

## `Regex`

```python
class Regex:
    def __init__(self, pattern: str, flags: int = 0): ...
    @property
    def pattern(self) -> str: ...
    @property
    def flags(self) -> int: ...          # resolved (UNICODE + VERSION1 added)
    @property
    def capture_count(self) -> int: ...  # excluding group 0

    def group_names(self) -> list[str]: ...
    def group_index(self, name: str) -> int | None: ...

    def is_match(self, haystack: str) -> bool: ...
    def find(self, haystack: str) -> Match | None: ...
    def find_at(self, haystack: str, start: int) -> Match | None: ...
    def match_at_start(self, haystack: str) -> Match | None: ...  # re.match
    def fullmatch(self, haystack: str) -> Match | None: ...
    def findall(self, haystack: str) -> list[Match]: ...
    def find_partial(self, haystack: str) -> PartialMatch | None: ...

    def replace(self, haystack: str, repl: str) -> str: ...
    def replace_all(self, haystack: str, repl: str) -> str: ...
    def split(self, haystack: str) -> list[str]: ...
    def dump(self) -> str: ...                                  # AST debug aid
```

`flags` is a bitwise OR of the module-level constants: `IGNORECASE`,
`MULTILINE`, `DOTALL`, `UNICODE`, `ASCII`, `VERBOSE`, `FULLCASE`, `WORD`,
`LOCALE`, `VERSION0`, `VERSION1`. `parse_flags("ims")` parses a flag string
for `re`-familiar ergonomics.

## `Match`

`Match` is sequence-like: `len(m)` is the number of groups (group 0 first),
and `m[i]` / `m["name"]` look up by index / name.

```python
class Match:
    @property
    def matched(self) -> str               # whole match (group 0)
    @property
    def group0(self) -> str                # alias of matched
    @property
    def input(self) -> str
    @property
    def start(self) -> int                 # byte offset
    @property
    def end(self) -> int
    @property
    def span(self) -> tuple[int, int]
    @property
    def capture_count(self) -> int
    @property
    def groups(self) -> list[str | None]
    @property
    def named_groups(self) -> dict[str, str]
    @property
    def all_captures(self) -> list[list[str | None]]
    @property
    def captures_dict(self) -> dict[str, list[str | None]]

    def group(self, *indices_or_names) -> ...   # re.match.group semantics
    def captures(self, index: int) -> list[str | None]
    def captures_by_name(self, name: str) -> list[str | None]
    def span_of(self, index: int = 0) -> tuple[int, int] | None
    def start_of(self, index: int = 0) -> int
    def end_of(self, index: int = 0) -> int
```

All offsets are **byte offsets** (UTF-8), matching Python's `re` and the Rust
core. `None` is returned for groups that did not participate.

## Partial matching

`find_partial` is an **end-anchored** search: it asks whether the haystack,
taken up to its end, could be the start of a full match. Use it when
validating input as the user types, parsing an incomplete stream, or asking
"could more input turn this into a match?"

It returns one of three outcomes:

| result                  | meaning                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `PartialMatch` (partial) | a valid prefix so far — more input could complete it          |
| `PartialMatch` (full)    | the input already fully matches (and consumes it to its end)  |
| `None`                  | a hard mismatch: no possible continuation could match         |

Each capturing group in a partial match is itself in one of three states,
reported by `group_state(i)`: `"matched"` (fully matched), `"partial"` (entered
but not yet completed), or `"none"` (never participated — `group(i)` is `None`).

```python
class PartialMatch:
    @property
    def status(self) -> str                # "full" | "partial"
    @property
    def is_full(self) -> bool
    @property
    def is_partial(self) -> bool
    @property
    def matched(self) -> str
    @property
    def start(self) -> int                 # byte offset where the match starts
    @property
    def end(self) -> int                   # byte offset of the input end (always len(haystack))
    @property
    def capture_count(self) -> int

    def group(self, index: int = 0) -> str | None
    def named_group(self, name: str) -> str | None
    def group_state(self, index: int = 0) -> str   # "matched" | "partial" | "none"
```

Incremental typing graduates `partial` → `full` → `None`:

```python
re = eregex.Regex(r"abc")
re.find_partial("")    # None      (nothing started yet)
re.find_partial("a")   # partial   .status == "partial"
re.find_partial("ab")  # partial
re.find_partial("abc") # full      .is_full
re.find_partial("abcd")# None      ('d' rules out any continuation)
```

Group states as a match fills in. With `token=([a-z]+)([0-9]+)([A-Z]+)`:

```python
re = eregex.Regex(r"token=([a-z]+)([0-9]+)([A-Z]+)")
p = re.find_partial("x token=abc")

p.is_partial           # True
p.matched              # 'token=abc'
p.start                # 2    (byte offset of the match)
p.end                  # 11   (end of input — always, since end-anchored)
p.capture_count        # 3

p.group(1)             # 'abc'   p.group_state(1) # 'matched'
p.group(2)             # ''      p.group_state(2) # 'partial'  (entered, empty so far)
p.group(3)             # None    p.group_state(3) # 'none'     (never entered)

re.find_partial("token=abc123XYZ")  # group 3 -> 'matched', status 'full'
re.find_partial("x token=abc!")     # None   ('!' rules out any continuation)
```

Named groups work the same way:

```python
re = eregex.Regex(r"token=(?P<word>[a-z]+)(?P<num>[0-9]+)")
p = re.find_partial("token=ab")
p.named_group("word")  # 'ab'   (matched)
p.named_group("num")   # ''     (partial — empty so far)
```

## Module-level helpers

```python
escape(s: str) -> str
escape_special_only(s: str) -> str
escape_literal_spaces(s: str) -> str
is_match(pattern: str, haystack: str) -> bool       # compiles pattern once
compile(pattern: str, flags: int = 0) -> Regex
parse_flags(flag_str: str) -> int
```

## Testing

```bash
. .venv/bin/activate
maturin develop --release
python -m unittest test_eregex -v
```

## Layout

This is one half of eregex's binding story. The same Rust core (`eregex`)
also ships Node.js bindings via `napi-rs`. See the project root for the core
crate and its feature matrix.

## License

Apache-2.0, matching the upstream `mrab-regex` project.
