# GemmaShop

This is an application for collaborative multi-tenant managing, editing and runnging presentation decks for a large multi-node video wall. Decks are a composition of slides made of typed layers. The application uses a message bus in two separate modes to drive a serialized and fast path data flows for high performance real-time coordinating of `editors`, `controllers` and `walls` endpoints.

## Code organisation

A monorepo for GemmaShop MVP

- [Turborepo](https://turborepo.com/) + [bun](https://bun.sh/)
- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- TanStack [Start](https://tanstack.com/start/latest) + [Router](https://tanstack.com/router/latest) + [Query](https://tanstack.com/query/latest) + [Form](https://tanstack.com/form/latest)
- [Vite 8](https://vite.dev/) + [Nitro v3](https://v3.nitro.build/)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Base UI](https://base-ui.com/) (base-maia)
- [MongoDB](https://www.mongodb.com/)
- [Better Auth](https://www.better-auth.com/)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) + [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)

```sh
├── apps
│    ├── web                    # TanStack Start web app
├── packages
│    ├── auth                   # Better Auth
│    ├── db                     # MongoDB
│    ├── emails                 # Template for emails
│    └── ui                     # shadcn/ui primitives & utils
├── tooling
│    └── tsconfig               # Shared TypeScript configuration
├── turbo.json
├── LICENSE
└── README.md
```

## Running in Development

To run this software in development, make sure to have Bun installed and a running instance of MongoDB replica set.

Check for environment variables to be set (.env)

Run `bun run dev`

## Running in Production

TBD

## Entry points

The application has multiple entry-points which are conditionned by the target deployment. The home page will currently have links to a few :

- /gallery _For the list of project_
- /quary _For project management_
- /quary/editor _Specifically for editing_
- /wall _For client rendering nodes (needs to be provided with query parameters c and r)_

## License

[MIT](./LICENSE)
