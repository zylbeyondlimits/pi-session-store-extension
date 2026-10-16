# pi-session-store

Save a temporary Pi conversation as a normal, resumable session with one command:

```text
/store [optional session name]
```

This is a small Pi extension for people who usually start Pi with `--no-session`, but occasionally want to keep a useful conversation.

## Features

- Adds the `/store` slash command.
- Saves the current active branch as a JSONL session.
- Places the session in Pi's normal session directory.
- Switches the current conversation to the new persistent session.
- Accepts an optional session name, for example `/store DDIA notes`.
- Does nothing destructive: it creates a new session file and leaves the temporary process history untouched.

## Install

From GitHub (available after a tagged release):

```bash
pi install git:github.com/zylbeyondlimits/pi-session-store-extension@v0.1.0
```

After the package is published to npm:

```bash
pi install npm:pi-session-store
```

For a local checkout during development:

```bash
pi install ./pi-session-store-extension
```

You can also try the extension for one invocation:

```bash
pi -e ./extensions/store-session.ts
```

## Usage

Start an ephemeral Pi session:

```bash
pi --no-session
```

When the conversation becomes useful, run:

```text
/store
```

Or give it a name:

```text
/store paper reading notes
```

The extension writes a session file under Pi's normal session store and switches to it. The session can then be found with `/resume` or resumed from the command line.

If the current session is already persistent, `/store` will not create a duplicate file. Passing a name will rename the current session instead.

## Privacy

The extension does not upload anything. It writes the current conversation to a local JSONL file. That file may contain prompts, model responses, tool calls, command output, file contents, or other sensitive information. Review the conversation before storing it and protect your Pi session directory accordingly.

Only the active branch is stored; abandoned branches are not copied.

## Compatibility

- Pi Coding Agent `1.3.0` or newer
- Node.js 22.19 or newer, as required by current Pi releases

## Development

```bash
npm install
npm run check
```

The test suite loads the extension with a small mock Pi runtime and verifies that a temporary session is serialized into a valid JSONL session file.

## License

MIT
