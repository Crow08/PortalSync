# Background pictures

The pictures behind the pages are optional and not part of the repository (their origin and license are unknown, see the
project README). To offer some, put image files into this folder and list them in `backgrounds.json`:

```json
[
  { "value": "forest", "label": "Forest", "file": "forest.jpg" }
]
```

- `value`: a unique id (stored in the browser), `label`: the name in the settings, `file`: the file name in this folder
  (letters, digits, `.`, `_`, `-`).
- Without `backgrounds.json` the settings offer only the gradient of the theme.
- Use only pictures you may redistribute. Everything in this folder except this README is git-ignored; once the pictures
  are free to publish, remove the ignore rule in the root `.gitignore` and add a `CREDITS.md` with source and license.
