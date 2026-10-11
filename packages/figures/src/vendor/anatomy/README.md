# Anatomy kit (vendored)

`iso-kit.ts` is `kit/iso-kit.ts` of the Anatomy skill, https://github.com/wheresryan22/anatomy, at commit
`dbf697a527bbf7d358668e1557cb1e35ff725d46` (2026-10-10), MIT (see `LICENSE`, copyright Ryan).

Folio uses the skill's method and this one file of its kit: the camera, the solids, the parts library and the SVG
string renderer. Nothing else of the skill is copied (no lathe, tubes, audit, WebGL or 3D), and nothing is fetched at
run time.

The only change is the three comment lines at the top (`@ts-nocheck`, the source and the licence): the file is not
written to this repository's compiler settings and is not linted. To update it, copy the new file over it, put the
three lines back, change the commit above, and run the figures' tests: they compare every frame with a kept copy.
