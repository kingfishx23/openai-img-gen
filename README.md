# openai-img-gen

A Claude Code skill, also usable by other agents that the `skills` CLI supports. It generates and edits images with
OpenAI's image models: new images from a prompt, or edits that recolour, restyle or combine your own photos and
reference images. Ask the agent for an image and it writes the prompt, runs the script, looks at the result and iterates.

The script, `skills/openai-img-gen/index.js`, has no dependencies and needs Node 18.3+.

## Install

```sh
npx skills add kingfishx23/openai-img-gen
```

Run the same command again to pull the latest version.

## API key

Set `OPENAI_API_KEY`, or copy `skills/openai-img-gen/.env.example` to `.env` in the same folder and fill it in:

```
OPENAI_API_KEY=sk-...
```

`.env` is gitignored. A real `OPENAI_API_KEY` environment variable takes priority over it. If you installed with
`npx skills add`, keep a copy of your `.env`, because reinstalling the skill may replace the folder.

## Use the script on its own

```sh
node skills/openai-img-gen/index.js "a watercolour of a shaved-ice dessert stall at dusk" -s 1536x1024
node skills/openai-img-gen/index.js -i photo.jpg -i palette.png -f prompt.txt -o out --name facade
node skills/openai-img-gen/index.js --help
```

Without `-i` it generates a new image. With `-i` (repeatable) it edits or combines those images. It prints each saved
file's path on stdout, and the token use and estimated cost on stderr. The default model is `gpt-image-2.5-sunburst`;
change it with `--model` or `OPENAI_IMAGE_MODEL`.
