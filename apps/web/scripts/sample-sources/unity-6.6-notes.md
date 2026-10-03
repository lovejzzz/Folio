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
- Windows in the Default layout: Hierarchy (left), Scene and Game tabs (centre), Inspector (right), Project and Console tabs (bottom). Reset with Window > Layouts > Default.

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
- A new material (Assets > Create > Material) uses the shader Universal Render Pipeline/Lit. Its Inspector has Surface Options (Workflow Mode, Surface Type, Render Face, Alpha Clipping, Receive Shadows), Surface Inputs (Base Map with a colour box beside it, Metallic Map with a slider, Smoothness with a slider at 0.5, Normal Map, Height Map, Occlusion Map, Emission, Tiling, Offset), Detail Inputs and Advanced Options. The colour of a material is the colour box beside Base Map; there is no field called "Albedo" or "Color".
- Clicking a colour box opens a window titled "Color": a colour wheel, a mode dropdown showing "RGB 0-255", sliders R, G, B, A, a box labelled "Hexadecimal", and "Defaults" swatches. The box is "Hexadecimal", not "Hex Color".
- A material is put on an object by dragging it from the Project window onto the object in the Scene view or the Hierarchy.
- Directional Light: Transform (Position 0, 3, 0; Rotation 50, -30, 0), then Light with four sections that open with a triangle: General (Type: Directional, Mode: Realtime), Emission, Rendering, Shadows. Under Emission: Light Appearance (set to "Filter and Temperature"), Filter (a colour box), Temperature (a slider, 5000 Kelvin), Intensity (2), Indirect Multiplier, Cookie. To give the light a plain colour, set Light Appearance to "Color". There is also a component named Universal Additional Light Data.
- The Scene view has a column of tools at its top left (View, Move, Rotate, Scale, Rect, Transform; keys Q, W, E, R, T, Y) and the scene gizmo at its top right with "Persp" under it. Play, Pause and Step are at the top centre of the Editor.
- If a script uses an older API, Unity may show a "Script Updating Consent" dialog offering to update the files: students following the page's code should not see it.
