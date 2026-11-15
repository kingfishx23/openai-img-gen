---
name: openai-img-gen
description: Generate or edit images with OpenAI's image models. Use when the user asks to create, generate, draw or render an image, illustration, mockup, concept art, logo idea or photo, or to edit, recolour, restyle or combine existing photos or images, even if they don't mention OpenAI.
---

# openai-img-gen

`index.js` in this skill's directory calls the OpenAI Images API. It has no dependencies and needs Node 18.3+.

```sh
node <this skill's directory>/index.js [options] "prompt"
node <this skill's directory>/index.js -i photo.jpg -i reference.png [options] -f prompt.txt
```

Without `-i` it makes a new image. With `-i` it edits or combines the given images. It prints each saved file's
absolute path on stdout and saves the prompt beside the images as `<name>-<time>.prompt.txt`. Progress, token use,
cost and errors go to stderr. Run `--help` for every option. The main ones are `-p NAME` (project subfolder),
`-o DIR` (exact folder), `--name PREFIX`, `-s auto|1024x1024|1536x1024|1024x1536`, `-q auto|low|medium|high`,
`-n COUNT`, `--format png|jpeg|webp` and `--background transparent`.

**Where images go:** with `-p NAME` they go to `$OPENAI_IMG_GEN_OUT/NAME/`. The base folder is set in this skill's `.env`,
or else it's the current folder. `-o DIR` overrides that and saves exactly there.

## Steps

1. **Write the prompt.** For anything longer than a sentence, write it to a file and pass it with `-f`. See
   "Writing prompts" below.
2. **Run it.** Always pass `-p` with a short name for the project in context: the brand, product, repo or folder the
   user is working on (for example `-p es-sebelas` or `-p kualing`), or a short topic if there's no project. Pass `-o`
   only when the user names a folder. Use a descriptive `--name`. Each call costs money. One image at `-q auto` usually costs a few cents, and `high` and `-n` multiply that. Use
   `-q low` for quick drafts, and ask before making more than about 4 images or many high-quality ones.
3. **Show the result.** Open the saved file with the Read tool so you can see it. Check it against the prompt (text
   spelling, what had to stay the same), then tell the user the path, what you see and the cost line.
4. **Iterate.** Change the prompt based on what went wrong, and keep the prompt file updated so it matches the best result.

If there is no API key, tell the user to set `OPENAI_API_KEY`, or to copy `.env.example` in this skill's directory to
`.env` and fill it in. Never ask them to paste the key into chat. If a request is blocked by moderation,
report the reason the script prints and suggest a reworded prompt. Don't retry the same prompt.

## Writing prompts

- **Say what each input image is for**, in order: "The FIRST image is a COLOUR REFERENCE ONLY. Do not copy its
  layout, shapes or text. The SECOND image is the photo to edit. Keep its framing and format."
- **Give one clear task**, then list exactly what to change, with concrete values (hex colours, materials, positions).
- **List what must stay the same.** For edits, say "Keep everything else exactly as it is" and name the things that
  must not drift: camera angle, lighting, background, people, other buildings.
- **Quote any text** that must appear, spelled exactly ("reads exactly \"ES SEBELAS\""). Ask for little text: image
  models misspell long text.
- **Name the style**: photorealistic, flat vector, watercolour, 3D render, and so on.
- **End with an "Avoid:" line** for the failure you expect, such as extra text, copying the reference's layout, or
  changing anything outside the target.
- Logos and icons on a plain or clear background: `--background transparent --format png`.
