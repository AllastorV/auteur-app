# Auteur

Auteur is a Windows desktop workspace for writers. Draft a screenplay, TV script, novel, stage play, radio play, comic or plain text. Use story cards, timed storyboards and an editable world map when the story calls for them.

## What it includes

- Writing pages for screenplays, novels and other supported formats, with revisions and PDF export.
- Story cards, a storyboard timeline, drawing tools, and animatic playback.
- An editable world map for the places behind the story.
- Local project files, with optional real-time collaboration through the web client and server.

## Run from source

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

For collaboration, start `npm run dev:server` and `npm run dev:web` in separate terminals. Run `npm test` and `npm run typecheck` to check changes.

## License

Auteur's source code is licensed under [GPL-3.0-only](LICENSE). Your writing, drawings, maps, and exports remain yours. See the [license summary](LICENSE-SUMMARY.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
