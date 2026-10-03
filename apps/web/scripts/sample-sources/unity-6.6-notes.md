# Instructor's version notes: Unity 6.6 (editor 6000.6.4), checked in the editor

Use these names exactly. They are what students see on screen.

## Unity Hub
- Sidebar: Projects, Templates, Installs. Settings is the gear at the top right; licenses are under Settings > Licenses > Add license.
- Projects > New project. The screen opens on the "Learning" templates. Open the dropdown beside the search box and choose "Core" to see Universal 2D, Universal 3D, High Definition 3D and others. The Editor version is chosen at the top of this screen.
- With a template selected, the panel on the right shows: Unity organization, Project name, Location, Use AI Assistant, Use Unity CLI, Source control provider, and the Create project button.
- The Project name box is also a dropdown: "Create new project" (connected to Unity Cloud, the default) or "Create new local project". Students choose "Create new local project", then type the name.
- Clicking Location opens a folder picker with a "Select folder" button.

## A new Universal 3D project
- The window title reads: SampleScene - <project name> - Windows, Mac, Linux - Unity 6.6 (6000.6.4f1).
- Hierarchy: SampleScene with Main Camera, Directional Light and Global Volume.
- Project window, Assets folder: InputSystem_Actions, Readme, Scenes, Settings, TutorialInfo. The scene file is Assets/Scenes/SampleScene.
- On first open the Inspector shows a "URP Empty Template" readme with a "Remove Readme Assets" button.
- Windows in the Default layout: Hierarchy (left), Scene and Game tabs (center), Inspector (right), Project and Console tabs (bottom). Reset with Window > Layouts > Default.

## Menus (top menu bar)
- File: New Scene, Open Scene, Save, Save As..., Build Profiles, Build And Run. There is no "Build Settings" item: the build window is File > Build Profiles.
- Edit: Undo, Redo, Duplicate, Rename, Delete, Play Mode, Project Settings... On a Mac, preferences are Unity > Settings...; on Windows, Edit > Preferences...
- GameObject: Create Empty, Create Empty Child, 2D Object, 3D Object, Visual Effects, Light, Audio, UI Toolkit, UI (Canvas), Camera.
- GameObject > 3D Object: Cube, Sphere, Capsule, Cylinder, Plane, Quad, Text - TextMeshPro.
- GameObject > UI (Canvas): Image, Text - TextMeshPro, Panel, Button - TextMeshPro, Toggle, Slider, Canvas, Event System. The menu is named "UI (Canvas)", not "UI".
- GameObject > Visual Effects: Particle System, Trail, Line. GameObject > Audio: Audio Source. GameObject > Light: Directional Light, Point Light, Spot Light.
- Assets > Create: Folder, Material, MonoBehaviour Script, Scene, Scripting, Physics Material, Input Actions, Animation, 2D, TextMeshPro. A new script is Assets > Create > MonoBehaviour Script (also under Scripting > MonoBehaviour Script). A scene is Assets > Create > Scene > Scene; a prefab is made by dragging an object from the Hierarchy into the Project window.
- Assets > Create > Animation: Animator Controller, Animation Clip. Window > Animation: Animation, Animator.
- Component > Physics: Rigidbody, Box Collider, Sphere Collider, Capsule Collider, Mesh Collider. Component > Physics 2D: Rigidbody 2D, Box Collider 2D, Circle Collider 2D, Capsule Collider 2D, Composite Collider 2D.
- Window: Layouts, General (Scene, Game, Inspector, Hierarchy, Project, Console), Animation, Audio, Package Management (Package Manager), Rendering, TextMeshPro.

## Code (C#), compiled in this version
- Input: new projects use the Input System package only. `Input.GetAxis`, `Input.GetKey` and the rest of the old Input class compile but throw InvalidOperationException when the game runs. Read keys with `Keyboard.current.aKey.isPressed`, `Keyboard.current.spaceKey.wasPressedThisFrame` (with `using UnityEngine.InputSystem;`), or use the project's own actions: `InputSystem.actions.FindAction("Move")` then `ReadValue<Vector2>()`. The template's InputSystem_Actions asset has a Player map with Move, Look, Attack, Interact, Crouch, Jump, Previous, Next, Sprint.
- Rigidbody: `rb.linearVelocity` and `rb.linearDamping`. `rb.velocity` is marked obsolete.
- Finding objects: `FindAnyObjectByType<T>()`. `FindFirstObjectByType<T>()` and `FindObjectOfType<T>()` are both marked obsolete in 6000.6 and give a yellow warning.
- Text: `using TMPro;` and `TMP_Text`. Scenes: `using UnityEngine.SceneManagement;` and `SceneManager.LoadScene(...)`.
- `AddForce`, `ForceMode.Impulse`, `OnTriggerEnter(Collider other)`, `CompareTag`, `Destroy`, `Instantiate`, `Time.deltaTime`, `[SerializeField]` are unchanged.

## The Inspector, as it reads in this version
- A new object made from the GameObject menu appears where the Scene view is looking, not at the origin: its Position is some uneven number. Students type 0, 0, 0 into Position (or use the three-dot menu on Transform > Reset) before the page gives positions.
- After creating an object or asset its name is in edit mode: type the name and press Enter.
- Every object: name box, Static, Tag, Layer; then Transform with Position, Rotation, Scale (X, Y, Z each).
- A primitive (Cube, Sphere...) has: Transform, a Mesh Filter, Mesh Renderer (Materials, Lighting, Probes, Additional Settings), and its collider (Box Collider, Sphere Collider...). At the bottom is the material, "Lit (Material)", greyed out because the default material cannot be edited, and the Add Component button.
- Sphere Collider: Edit Collider, Is Trigger, Provides Contacts, Material (shows "None (Physics Material)"), Center, Radius, Layer Overrides.
- Add Component opens a small search box: type the name and press Enter. Typing "Rigidbody" lists Rigidbody and Rigidbody 2D.
- Rigidbody: Mass (1), Linear Damping (0), Angular Damping (0.05), Automatic Center Of Mass, Automatic Tensor, Use Gravity (ticked), Is Kinematic, Interpolate (None), Collision Detection (Discrete), Constraints (Freeze Position X Y Z, Freeze Rotation X Y Z), Layer Overrides. There are no fields named "Drag" or "Angular Drag".
- A new material (Assets > Create > Material) uses the shader Universal Render Pipeline/Lit. Its Inspector has Surface Options (Workflow Mode, Surface Type, Render Face, Alpha Clipping, Receive Shadows), Surface Inputs (Base Map with a color box beside it, Metallic Map with a slider, Smoothness with a slider at 0.5, Normal Map, Height Map, Occlusion Map, Emission, Tiling, Offset), Detail Inputs and Advanced Options. The color of a material is the color box beside Base Map; there is no field called "Albedo" or "Color".
- Clicking a color box opens a window titled "Color": a color wheel, a mode dropdown showing "RGB 0-255", sliders R, G, B, A, a box labelled "Hexadecimal", and "Defaults" swatches. The box is "Hexadecimal", not "Hex Color".
- A material is put on an object by dragging it from the Project window onto the object in the Scene view or the Hierarchy.
- Directional Light: Transform (Position 0, 3, 0; Rotation 50, -30, 0), then Light with four sections that open with a triangle: General (Type: Directional, Mode: Realtime), Emission, Rendering, Shadows. Under Emission: Light Appearance (set to "Filter and Temperature"), Filter (a color box), Temperature (a slider, 5000 Kelvin), Intensity (2), Indirect Multiplier, Cookie. To give the light a plain color, set Light Appearance to "Color". There is also a component named Universal Additional Light Data.
- The Scene view has a column of tools at its top left (View, Move, Rotate, Scale, Rect, Transform; keys Q, W, E, R, T, Y) and the scene gizmo at its top right with "Persp" under it. Play, Pause and Step are at the top center of the Editor.
- If a script uses an older API, Unity may show a "Script Updating Consent" dialog offering to update the files: students following the page's code should not see it.
- Edit > Duplicate (Ctrl+D, Command+D on a Mac) names the copy "Ball (1)", selects it and does NOT start a rename. To rename a selected object: Edit > Rename (F2 on Windows, Enter on a Mac), type the name, press Enter.
- A primitive's Inspector reads, in order: Transform, "Cube (Mesh Filter)" (or "Sphere (Mesh Filter)"), Box Collider (or Sphere Collider), Mesh Renderer, then the material.
- A project made from Universal 3D has in Assets: Scenes, Settings, TutorialInfo, a Readme and InputSystem_Actions. There is no Materials, Scripts or Prefabs folder until the student makes one (Assets > Create > Folder).
- The Game view's aspect dropdown is the third control in its toolbar and reads "Free Aspect" in a new project. The choice is kept per project: each new project needs "16:9 Aspect" chosen again.
- Changes made during Play to objects in the scene (a Transform, a Rigidbody's Mass) are undone when Play stops. Changes to assets (a material's color or Smoothness, a physics material) are kept.
- An unsaved scene shows an asterisk after its name in the Hierarchy on both systems; do not rely on the window's title bar.
- A new Physics Material (Assets > Create > Physics Material): Dynamic Friction 0.6, Static Friction 0.6, Bounciness 0, Friction Combine Average, Bounce Combine Average. With Bounciness 0.8 and Average against a floor with no material, a ball dropped 6 units bounces once (under 1 unit); with Bounce Combine set to Maximum it bounces eight times or more. A hit slower than 2 units a second does not bounce.
- A new Point Light (GameObject > Light > Point Light): Range 10, Intensity 1, no shadows. At that Intensity it is invisible on a floor 4 units below in a scene lit by the template's sky; Range does not make it brighter. Intensity 30 gives a clear pool of light. Lowering the Directional Light to 0.4 does not make the scene dark, because the sky still lights it.
- A number box takes the keyboard hyphen for a negative value; a typographic minus sign pasted from a page is rejected.
- Opening a project with no internet connection can show a "Packages with Errors" box: Dismiss is safe.
- Timings measured in this version for a 1-unit sphere with a Rigidbody (mass 1) dropped at 0, 6, -7 onto a ramp at 0, 2, -4, rotation 20, 0, 0, scale 6, 0.4, 10 in a 20 by 20 arena with walls 2 high: lands at 0.7 s, leaves the ramp at 2.75 s at 6.5 units a second, reaches the far wall at 4.1 s and rests against it. A mass 10 copy beside it keeps pace exactly.

## UI, text and effects, checked in this version
- The first time a TextMeshPro object is added (GameObject > UI (Canvas) > Text - TextMeshPro), a window titled "TMP Importer" opens: click "Import TMP Essentials", wait, and close the window. It happens once per project.
- Adding the first UI object also adds a Canvas (components: Canvas, Canvas Scaler, Graphic Raycaster) and an EventSystem (components: Event System, Input System UI Input Module). The text object is named "Text (TMP)" and sits under Canvas; its component is "TextMeshPro - Text (UI)", and in code its type is TMP_Text (using TMPro;).
- A particle system is GameObject > Visual Effects > Particle System (there is no "Effects" menu). An audio source is GameObject > Audio > Audio Source, or Add Component > Audio Source.
- A prefab is made by dragging an object from the Hierarchy into a folder in the Project window; Assets > Create has only "Prefab Variant" at its top level (Assets > Create > Scene > Prefab makes an empty one).
- Built-in tags: Untagged, Respawn, Finish, EditorOnly, MainCamera, Player, GameController. Others are added with the Tag dropdown > Add Tag...
- If a script uses an API marked for automatic update (rb.velocity, rb.drag), a box titled "Script Updating Consent" asks whether to update the files: with the code on these pages it does not appear; a student who pasted old code should choose "No" and fix the line by hand.

## 2D (the Universal 2D template), checked in this version
- A project made from Universal 2D opens SampleScene with Main Camera (orthographic, Size 5, a dark blue background) and Global Light 2D. A window titled "2D URP Project" may open over the Editor: close it. Assets holds Scenes and Settings; InputSystem_Actions is in Assets/Settings, and InputSystem.actions.FindAction("Move") and FindAction("Jump") work as in the 3D project.
- GameObject > 2D Object: Sprites (Square, Circle, Capsule, Triangle, 9-Sliced, Hexagon Flat Top, Hexagon Point Top, Isometric Diamond), Physics (Dynamic Sprite, Static Sprite), Tilemap (Rectangular, Hexagonal Flat Top, Hexagonal Point Top, Isometric, Isometric Z as Y), Sprite Shape, Sprite Mask. These 2D menus exist only in a 2D project: the 3D project has no Sprites or Tilemap entries.
- GameObject > 2D Object > Tilemap > Rectangular adds a Grid with a child Tilemap (components: Tilemap, Tilemap Renderer). The palette is Window > 2D > Tile Palette. Assets > Create > 2D: Sprites (the same shapes), Tile Palette > Rectangular, Tiles > Rule Tile, Sprite Atlas.
- Component > Physics 2D: Rigidbody 2D, Box Collider 2D, Circle Collider 2D, Capsule Collider 2D, Polygon Collider 2D, Edge Collider 2D, Composite Collider 2D. Component > Tilemap: Tilemap Collider 2D.
- To merge a tilemap's colliders: add Composite Collider 2D to the Tilemap (this adds a Rigidbody 2D: set its Body Type to Static), then on Tilemap Collider 2D set "Composite Operation" to Merge. There is no "Used By Composite" checkbox in this version.
- Code that compiles without warnings: rb.linearVelocity = new Vector2(x, rb.linearVelocity.y); rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse); rb.linearDamping; OnTriggerEnter2D(Collider2D other); OnCollisionEnter2D(Collision2D collision); Physics2D.OverlapCircle(point, radius, LayerMask.GetMask("Ground")); Physics2D.Raycast; GetComponent<SpriteRenderer>().flipX; animator.SetBool("isRunning", true); jumpAction.WasPressedThisFrame(); Keyboard.current.spaceKey.wasPressedThisFrame. Rigidbody2D.velocity and Rigidbody2D.drag are marked obsolete.
- No layer named Ground exists until it is added (Layer dropdown > Add Layer...).
- Window > 2D > Sprite Editor; Window > Animation > Animation and Animator, as in 3D.
