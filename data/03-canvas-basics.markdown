```yaml
---
title: Canvas API Basics
description: A comprehensive guide to using the HTML5 Canvas API for rendering graphics in web-based games.
tags: [JavaScript, Canvas, game development, web games, React]
priority: high
language: he
---
```

# יסודות ה-Canvas API

## Introduction
The HTML5 Canvas API is a cornerstone of web-based game development, providing a powerful and flexible way to render 2D graphics directly in the browser. It enables developers to draw shapes, images, and text, making it ideal for creating game visuals like sprites, backgrounds, and UI elements. This guide covers the essentials of the Canvas API, including setup, drawing primitives, and animations, serving as a foundation for projects like Tetris (**12-tutorial-tetris.md**) and Pong (**13-example-react-game.md**).

## General Explanation
The Canvas API operates on an HTML `<canvas>` element, which acts as a drawing surface. A 2D rendering context (`getContext('2d')`) provides methods to draw shapes, lines, text, and images. Key concepts include:
- **Canvas Setup**: Configuring the canvas size and context.
- **Drawing Primitives**: Rendering shapes like rectangles, circles, and lines.
- **Transformations**: Applying scaling, rotation, or translation to graphics.
- **Animation**: Combining Canvas with a game loop (from **02-game-loop.md**) for dynamic visuals.
- **State Management**: Saving and restoring the context to manage drawing states.

This guide focuses on practical Canvas usage for games, with examples that integrate with JavaScript and React.

## Practical Usage Examples

### 1. Canvas Setup and Basic Rectangle
Initialize a canvas and draw a filled rectangle.

```javascript
function setupCanvas(canvasId, width, height) {
  const canvas = document.getElementById(canvasId);
  const context = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context };
}

// Draw a rectangle
function drawRectangle(context, x, y, width, height, color) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400);
drawRectangle(context, 50, 50, 100, 100, 'blue');
```

This snippet, reusable from **14-code-snippets.md**, sets up a canvas and draws a blue square.

### 2. Drawing a Circle
Draw a circle, useful for game elements like balls in Pong.

```javascript
function drawCircle(context, x, y, radius, color) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.closePath();
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400);
drawCircle(context, 400, 200, 20, 'white');
```

### 3. Animated Shape with Game Loop
Combine Canvas with a game loop (from **02-game-loop.md**) to animate a moving circle.

```javascript
function createGameLoop(update, render) {
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400);
const state = { x: 400, y: 200, dx: 2, dy: 1 };

function update() {
  state.x += state.dx;
  state.y += state.dy;
  if (state.x < 0 || state.x > canvas.width) state.dx = -state.dx;
  if (state.y < 0 || state.y > canvas.height) state.dy = -state.dy;
}

function render() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawCircle(context, state.x, state.y, 20, 'white');
}

createGameLoop(update, render);
```

This animates a bouncing circle, similar to the ball in Pong (**13-example-react-game.md**).

### 4. Drawing Text for UI
Render text for game UI, such as scores or instructions.

```javascript
function drawText(context, text, x, y, font, color) {
  context.font = font;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400);
drawText(context, 'Score: 100', 50, 30, '20px Arial', 'white');
```

### 5. React Integration with Canvas
Integrate Canvas drawing into a React component for modularity.

```javascript
import React, { useRef, useEffect } from 'react';

function GameCanvas({ width, height }) {
  const canvasRef = useRef(null);
  const state = { x: 400, y: 200, dx: 2, dy: 1 };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    function update() {
      state.x += state.dx;
      state.y += state.dy;
      if (state.x < 0 || state.x > canvas.width) state.dx = -state.dx;
      if (state.y < 0 || state.y > canvas.height) state.dy = -state.dy;
    }

    function render() {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.arc(state.x, state.y, 20, 0, Math.PI * 2);
      context.fillStyle = 'white';
      context.fill();
      context.closePath();
      context.font = '20px Arial';
      context.fillText('Bouncing Ball', 50, 30);
    }

    function loop() {
      update();
      render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return () => {}; // Cleanup if needed
  }, []);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} width={width} height={height} className="border-2 border-white" />
    </div>
  );
}

// Usage
<GameCanvas width={800} height={400} />;
```

### Integration with Other Projects
As a high-priority guide, this connects to other tutorials:
- **Tetris (12-tutorial-tetris.md)**: The `drawRectangle` function can render tetrominoes, and the game loop example can drive the falling mechanics.
- **Pong (13-example-react-game.md)**: The `drawCircle` and `drawText` functions can render the ball and score, while the React integration mirrors Pong’s component structure.
- **Code Snippets (14-code-snippets.md)**: The `setupCanvas` and `drawCircle` functions align with snippets from **14-code-snippets.md**.
- **Few-Shot Examples (15-fewshot-examples.json)**: The circle-drawing and React integration examples match prompts like “Draw a red square” or “Integrate a canvas-based game into React.”

For example, integrating with the game platform from **13-example-react-game.md**:

```javascript
import React, { useState } from 'react';
import GameCanvas from './GameCanvas'; // From this guide
import { tetrisLoop } from './Tetris'; // From 12-tutorial-tetris.md
import { pongLoop } from './Pong'; // From 13-example-react-game.md

function GamePlatform() {
  const [game, setGame] = useState('canvas');
  const canvasDemoLoop = (context, canvas) => {
    const state = { x: 400, y: 200, dx: 2, dy: 1 };
    return () => {
      state.x += state.dx;
      state.y += state.dy;
      if (state.x < 0 || state.x > canvas.width) state.dx = -state.dx;
      if (state.y < 0 || state.y > canvas.height) state.dy = -state.dy;
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.arc(state.x, state.y, 20, 0, Math.PI * 2);
      context.fillStyle = 'white';
      context.fill();
      context.closePath();
      context.font = '20px Arial';
      context.fillText('Canvas Demo', 50, 30);
    };
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 min-h-screen">
      <button onClick={() => setGame('canvas')} className="px-4 py-2 bg-blue-500 text-white rounded mb-4">Canvas Demo</button>
      <button onClick={() => setGame('tetris')} className="px-4 py-2 bg-green-500 text-white rounded mb-4">Tetris</button>
      <button onClick={() => setGame('pong')} className="px-4 py-2 bg-blue-500 text-white rounded mb-4">Pong</button>
      <GameCanvas width={800} height={400} gameLoop={game === 'canvas' ? canvasDemoLoop : game === 'tetris' ? tetrisLoop : pongLoop} />
    </div>
  );
}
```

This integrates a Canvas demo with Tetris and Pong, showcasing modularity.

## Best Practices
- **Clear Canvas**: Always clear the canvas before rendering to avoid artifacts (e.g., `context.fillRect(0, 0, canvas.width, canvas.height)`).
- **State Management**: Use `beginPath` and `closePath` for shapes like circles to prevent unintended line connections.
- **Performance**: Minimize redraws by only updating changed areas when possible.
- **Responsive Design**: Adjust canvas size dynamically for different screen sizes using `window.innerWidth` or CSS.
- **React Integration**: Use `useRef` for canvas access and `useEffect` for initialization, ensuring cleanup to avoid memory leaks.
- **Reusability**: Write modular drawing functions (e.g., `drawCircle`, `drawText`) for reuse, as shown in **14-code-snippets.md**.

This guide equips developers with the skills to use the Canvas API effectively for web-based games.