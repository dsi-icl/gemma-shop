# GemmaShop

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
│    └── ui                     # shadcn/ui primitives & utils
├── tooling
│    └── tsconfig               # Shared TypeScript configuration
├── turbo.json
├── LICENSE
└── README.md
```

## License

[MIT](./LICENSE)
