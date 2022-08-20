# ts-package-boilerplate

Minimal, opinionated boilerplate for a javascript library package or project using Typescript.

## Features:

- Typescript configuration
- Yarn configuration including essential scripts
- Opinionated linting setup based on ESLint and Prettier
- Jest test configuration
- Ready to publish to npm

## Using this boilerplate:

- Clone this repository:

```shell
$ git clone git@github.com:filp/ts-package-boilerplate.git my-project-name
$ cd my-project-name
```

- Update `package.json` with your project name, author name, etc.
- Install dependencies, and you're ready to go!

```shell
$ yarn
```

## Workflow scripts:

### build

Builds files under `src/` into the `build/` directory, using `tsc -b .`

```shell
$ yarn build
```

### dev

Runs `src/index.ts` directly. Useful for executables, or quickly testing your work.

```shell
$ yarn dev
```

### lint

Runs `eslint .` with the included `prettier` configuration against the project.

```shell
$ yarn lint
```

### test

Runs `jest .` with the included `jest` configuration against the project. Test files are expected
alongside the files they're testing, with a `.test.ts` suffix.

```shell
$ yarn test
```

You can also modify this command to only include, for example, a `tests/` folder. Edit the `test` script in `package.json`:

```json
{
  "scripts": {
    "test": "jest tests/"
  }
}
```

### prepack

Runs linting, tests, and build, ahead of packaging the project for distribution (through e.g npm).

This is a lifecycle hook that you will likely not run directly, but will instead be called automatically during package publishing.

```shell
$ yarn prepack
```

## Stuff

Contributions are welcome! Please open tickets or - ideally - pull requests with your suggestions.
