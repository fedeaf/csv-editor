# Third-party notices

CSV Editor is copyright (C) 2026 fedeaf and licensed under the AGPL-3.0-or-later (see `LICENSE`). It includes the
following software, which keeps its own license; the MIT license of Papa Parse is compatible with the AGPL.

## Papa Parse

- Version: 5.7.0 (the one installed when this file was written)
- Use: reads CSV text into rows and fields (`src/csv/parse.ts`)
- Project: https://www.papaparse.com
- License: MIT

```
The MIT License (MIT)

Copyright (c) 2015 Matthew Holt

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Where the notice is

The built file, `dist/index.html`, is a single file that contains Papa Parse's code. The minifier removes
comments, so the build (`vite.config.ts`) reads the license text from the installed package and writes it at the top of
that file as an HTML comment, together with the version. Updating Papa Parse updates it with no further step.

Everything else that the project uses (TypeScript, Vite, Vitest and the type definitions) is only needed to build and
test it, and none of it is part of the built file.
