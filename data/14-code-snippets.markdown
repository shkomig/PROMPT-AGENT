```yaml
---
title: Code Snippets for Game Development
description: A collection of reusable code snippets for common game development tasks using JavaScript and Canvas.
tags: [JavaScript, Canvas, React, game development, code snippets]
priority: PRIORITY
language: he
---
```

# קטעי קוד לפיתוח משחקים

## Introduction
In web-based game development, reusable code snippets are essential for streamlining tasks like rendering graphics, handling user input, and managing game state. These snippets save time and ensure consistency across projects. This guide provides a curated collection of JavaScript and Canvas API snippets tailored for game development, with examples that can be integrated into projects like Tetris (**12-tutorial-tetris.md**) or Pong (**13-example-react-game.md**). These snippets are designed for browser-based environments, making them ideal for interactive applications.

## General Explanation
The snippets below address common game development tasks:
- **Canvas Setup**: Initializing a canvas for rendering game graphics.
- **Game Loop**: Managing updates and rendering for smooth gameplay.
- **Collision Detection**: Checking for overlaps between game objects.
- **User Input Handling**: Capturing keyboard or mouse events for interactivity.
- **Score Management**: Tracking and displaying scores.
- **React Integration**: Wrapping Canvas-based games in React components.

Each snippet is self-contained, well-documented, and designed to be modular for easy reuse in various game projects.

## Practical Usage Examples

### 1. Canvas Setup
Initialize a canvas with a specific size and scale for pixel-perfect rendering.

```javascript
function setupCanvas(canvasId, width, height, scale = 1) {
  const canvas = document.getElementById(canvasId);
  const context = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  context.scale(scale, scale);
  return { canvas, context };
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400, 1);
context.fillStyle = '#000';
context.fillRect(0, 0, canvas.width, canvas.height);
```

### 2. Game Loop
Create a game loop using `requestAnimationFrame` for smooth updates at ~60 FPS.

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
const gameState = { x: 0, y: 0 };
function update() {
  gameState.x += 1; // Move object
}
function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'red';
  context.fillRect(gameState.x, gameState.y, 20, 20);
}
createGameLoop(update, render);
```

### 3. Collision Detection
Check for collisions between two rectangular objects (e.g., paddle and ball in Pong).

```javascript
function checkCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

// Usage
const paddle = { x: 10, y: 150, width: 10, height: 100 };
const ball = { x: 15, y: 160, width: 10, height: 10 };
if (checkCollision(paddle, ball)) {
  console.log('Collision detected!');
}
```

### 4. Keyboard Input Handling
Capture keyboard input for controlling game objects (e.g., paddle movement).

```javascript
function setupKeyboardControls(actions) {
  document.addEventListener('keydown', (event) => {
    if (actions[event.key]) actions[event.key]();
  });
}

// Usage
const controls = {
  'ArrowUp': () => paddle.y -= 10,
  'ArrowDown': () => paddle.y += 10
};
setupKeyboardControls(controls);
```

### 5. Score Management
Track and display scores, updating them based on game events.

```javascript
function createScoreManager(context, canvas) {
  let score = 0;
  return {
    increment: () => score++,
    reset: () => (score = 0),
    draw: () => {
      context.font = '20px Arial';
      context.fillStyle = 'white';
      context.fillText(`Score: ${score}`, 50, 30);
    }
  };
}

// Usage
const scoreManager = createScoreManager(context, canvas);
scoreManager.increment(); // Add point

    ## Simple collision (AABB)
    ```javascript
    function aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    }
    ```
scoreManager.draw(); // Render score
```

### 6. React Canvas Integration
Wrap a Canvas-based game in a React component for integration into larger apps.

```javascript
import React, { useRef, useEffect } from 'react';

function GameCanvas({ width, height, gameLoop }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    gameLoop(context, canvas);
  }, [gameLoop]);

  return <canvas ref={canvasRef} width={width} height={height} className="border-2 border-white" />;
}

// Usage
function App() {
  const gameLoop = (context, canvas) => {
    context.fillStyle = 'blue';
    context.fillRect(0, 0, canvas.width, canvas.height);
  };
  return <GameCanvas width={800} height={400} gameLoop={gameLoop} />;
}
```

### Integration with Other Projects
As a PRIORITY tutorial, these snippets are designed for reuse in projects like Tetris (**12-tutorial-tetris.md**) or Pong (**13-example-react-game.md**). For example:
- The **Canvas Setup** and **Game Loop** snippets can replace the basic initialization in the Tetris game, making the code more modular.
- The **Collision Detection** snippet can enhance Pong by adding precise hit detection for paddles and the ball.
- The **React Canvas Integration** snippet can wrap the Tetris game loop, as shown in **12-tutorial-tetris.md**, or extend Pong into a multi-game platform, as shown in **13-example-react-game.md**. For instance:

```javascript
import React from 'react';
import GameCanvas from './GameCanvas';
import { tetrisLoop } from './Tetris'; // From 12-tutorial-tetris.md
import { pongLoop } from './Pong'; // From 13-example-react-game.md

function GamePlatform() {
  const [game, setGame] = React.useState('tetris');
  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 min-h-screen">
      <button onClick={() => setGame('tetris')} className="px-4 py-2 bg-green-500 text-white rounded mb-4">
        Play Tetris
      </button>
      <button onClick={() => setGame('pong')} className="px-4 py-2 bg-blue-500 text-white rounded mb-4">
        Play Pong
      </button>
      <GameCanvas width={800} height={400} gameLoop={game === 'tetris' ? tetrisLoop : pongLoop} />
    </div>
  );
}
```

This integrates multiple games using the **GameCanvas** component, showcasing modularity.

## Best Practices
- **Modularity**: Write snippets as independent functions to maximize reusability across projects.
- **Documentation**: Comment code clearly to explain parameters and usage.
- **Performance**: Use `requestAnimationFrame` for game loops to ensure smooth rendering and avoid CPU overuse.
- **Scalability**: Design snippets to handle varying canvas sizes and game states.
- **Accessibility**: Ensure input handling supports multiple devices (e.g., keyboard and touch).
- **React Compatibility**: Use hooks like `useRef` and `useEffect` for clean integration with React, avoiding memory leaks by cleaning up event listeners and intervals.

This collection of snippets provides a robust toolkit for web-based game development, compatible with browser environments and React projects.