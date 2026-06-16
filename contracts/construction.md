RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test.
Scope: the slice, the whole slice, nothing but the slice. Adjacent improvements belong to later phases — note them in the final message instead.
Gate before commit; one atomic commit with the exact message provided.
Tests follow the conventions in the context block; absent one: Given/When/Then titles, Arrange-Act-Assert bodies, the unit under test named sut, results in result, one behaviour per test.
