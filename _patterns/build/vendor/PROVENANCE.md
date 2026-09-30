# Vendored, build-time only

`elk.bundled.js` is here so `board-layout.mjs` can lay out the WRL board at
**build time**. Nothing in this directory is ever served: `build.mjs` writes
only the keys of `outputs` into `patterns/`, and this path is not one of them.
A reader of the book downloads no layout engine, because the geometry is baked
into the SVG the build emits.

That is the whole reason the dependency is affordable here. Super's cockpit
has to lay its schematics out live in the app and pays 1.5 MB for it
(`super/cockpit/ui/vendor/`, branch `review-content-staging`); the book runs
the same engine once, on a build machine, and ships coordinates.

## What is here

`elk.bundled.js` is the unmodified `lib/elk.bundled.js` from npm `elkjs@0.10.0`
— byte-identical to the copy Super vendored on 2026-09-14, which is why the two
surfaces can be said to use the same algorithm and not merely the same name.

- Bundle SHA-256: `48d338d5aeddd9503ccf1d12661c11b5d7d43c6afc5f66c7ddb2ea4170c0f6bf`
- Source: https://github.com/kieler/elkjs/tree/0.10.0
- Registry artifact: https://registry.npmjs.org/elkjs/-/elkjs-0.10.0.tgz
- License: EPL-2.0, retained in `ELK_LICENSE.md`

To re-derive:

    npm pack --ignore-scripts elkjs@0.10.0
    tar xzOf elkjs-0.10.0.tgz package/lib/elk.bundled.js > elk.bundled.js
    sha256sum elk.bundled.js

## If this dependency is unwanted

`board-layout.mjs` is the only file that names it, and both graph stencils in
`surface/surface.mjs` still carry their own hand-rolled placement: they use a
baked layout when `params.layout` is present and fall back to computing one
when it is not. Delete this directory and the module, stop passing `layout`,
and the board returns to the geometry it had before — smaller diff, bigger
canvas. Nothing else in the book depends on it.
