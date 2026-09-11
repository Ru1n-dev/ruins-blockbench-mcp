# BB Academy video evidence

These notes are based on the five publicly listed BB Academy YouTube videos reviewed on 2026-09-08. The review read the full available English auto-captions and descriptions; it was not an independent transcription or a frame-by-frame audit. Treat the notes as workflow suggestions, not format specifications. See the [source coverage record](https://www.youtube.com/@bbacademynet) and verify current UI behaviour in the connected Blockbench session.

## Project start and saving

Source: [Blockbench for COMPLETE Beginners](https://www.youtube.com/watch?v=2cNr0_IUaeQ), with checkpoints around [format selection](https://www.youtube.com/watch?v=2cNr0_IUaeQ&t=100s), [project settings](https://www.youtube.com/watch?v=2cNr0_IUaeQ&t=301s), and [saving distinctions](https://www.youtube.com/watch?v=2cNr0_IUaeQ&t=382s).

Start from the workspace that matches the intended output. Opening a format adds menus and settings, so absence of a control on the initial screen is not evidence that the feature is unavailable. Keep the editable project separate from the model/image files exported for a game or another application. During production, save the project; for delivery, provide the files required by the target. Confirm filenames, identifiers, UV mode, and image dimensions. Use layout recovery and Help search when the UI is unfamiliar.

The video's advice about not using “Save Model” is workflow-specific and must not be turned into a rule forbidding exports or backups. It also is not a guarantee that every backup remains recoverable forever.

## Transform tools and symmetry

Source: [Blockbench TOOLS for Beginners](https://www.youtube.com/watch?v=_LUUarDxtSA), with checkpoints around [coordinate spaces](https://www.youtube.com/watch?v=_LUUarDxtSA&t=44s), [pivots and joining](https://www.youtube.com/watch?v=_LUUarDxtSA&t=120s), and [recording features](https://www.youtube.com/watch?v=_LUUarDxtSA&t=446s).

Before Move, Resize, or Rotate, identify whether the transform uses Global, Parent, or Local space. Moving a rotated part along its own axes is different from moving it along the scene axes. A pivot changes the rotation centre; Vertex Snap aligns a selected vertex to another vertex. Mirror Modeling keeps symmetric edits linked, while duplicating and flipping allows the copies to diverge; neither preference is universal.

Planar resize handles act on two axes and the centre handle can scale proportionally. Modifier keys can change snapping increments and centre-based behaviour, but exact values depend on version and settings; inspect the current tooltip or UI rather than sending a video-specific shortcut blindly. GIF export can expose length, FPS, background, and turntable choices; Timelapse records the creation process rather than the model's game animation.

## Minecraft-like style and cleanup

Source: [Minecraft Style BASICS in Blockbench](https://www.youtube.com/watch?v=kmMtFxGzUAI), with checkpoints around [beginner mistakes](https://www.youtube.com/watch?v=kmMtFxGzUAI&t=146s), [the workflow](https://www.youtube.com/watch?v=kmMtFxGzUAI&t=343s), and [final cleanup](https://www.youtube.com/watch?v=kmMtFxGzUAI&t=474s).

Vanilla-like is a requested visual direction, not a universal correctness test. Decide whether the result should blend with its surroundings, be cute, dark, exaggerated, or otherwise stylized. Review coplanar conflicts, random near-colour noise, monotonous single-colour areas, banded gradients, unreadable light direction, and excessive small-cube stair steps. Use coherent colour areas and material differences instead of assigning a new colour to every pixel.

A useful order is reference/idea → shape → texture → required animation → cleanup. If painting reveals that the silhouette is wrong, return to geometry; if the material reads poorly, revise the palette and clusters. Finish with meaningful group names, unused texture areas, and padding. The video mentions making Z-fighting less visible with matching colours, but matching colours is not a structural fix: remove the overlapping faces.

## Sword example and reuse

Source: [How to Model EPIC Sword in Blockbench](https://www.youtube.com/watch?v=u2pDUPPXBus), with checkpoints around [the handle](https://www.youtube.com/watch?v=u2pDUPPXBus&t=99s), [Vertex Snap](https://www.youtube.com/watch?v=u2pDUPPXBus&t=228s), and [choosing geometry versus decoration](https://www.youtube.com/watch?v=u2pDUPPXBus&t=263s).

Break a reference into handle, guard, decoration, and blade. Set dimensions from the silhouette and expected grip/display. In the video, Vertex Snap is used to bring ends together and Resize to regularize forms; small offsets can separate overlapping decorations. Use texture for eyes or thin motifs, and geometry for a required tilt or readable volume. Duplicating after painting can share a painted result, but UV sharing should not be assumed when copies need different patterns.

The video's format and exact dimensions, angles, offsets, and shortcuts are not reusable constants. It demonstrates shape work; do not claim it teaches a complete sword texturing continuation unless that source has separately been reviewed. Check first-person, third-person, GUI, ground, and item-frame views before removing hidden faces.

## NPC short and evidence limits

Source: [How to Make a Bunch of Cool NPCs](https://www.youtube.com/watch?v=SZ3X69RquVA).

This short is primarily a showcase and course promotion. It does not provide a reproducible operation sequence for NPC geometry, UVs, or batch generation. Do not infer a production algorithm from its title, and do not turn promotional claims about speed or improvement into a guarantee. Public videos, paid courses, private Discord material, unlisted/deleted videos, and subtitles must be kept distinct.

## Operational rule

Use these video observations only after checking the target format, current Blockbench/MCP schemas, and game runtime. Auto-captions can misrecognize names, key bindings, and numbers. When captions do not establish a fact, mark it as unverified instead of filling the gap from expectation.

