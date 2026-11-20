# Rulings

What is settled, what was refused, for which paths. One line per ruling, append-only; the
decisions phase writes them, `rulings-lint` checks them. Why a ruling was made is not stored:
infer it from `DOCTRINE.md` and the code.

- R-001 [greet.sh] The shout flag uppercases the whole greeting with tr. Refused: bash 4 `${greeting^^}`.
