---
name: Vercel Express detection
description: Why a locally runnable API bundle can fail Vercel framework detection.
---

Vercel's native Express builder recognizes entrypoints using a textual check for
an Express import. A default-exported, working Express application is not alone
sufficient when prebundling has erased that import.

**Why:** An API bundle passed local health checks but Vercel rejected it with
“No entrypoint found which imports express.” This is separate from the earlier
incorrect output-directory error.

**How to apply:** When changing API packaging for Vercel, verify framework
detection as well as runtime behavior. Preserve a real Express import (with the
runtime dependency available), rather than adding a fake import in a comment
or assuming a successful local build proves Vercel compatibility.
