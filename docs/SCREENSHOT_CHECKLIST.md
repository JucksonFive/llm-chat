# Screenshot Checklist for README.md

This checklist helps you capture all screenshots needed for the README.md documentation.

## Priority: Critical (Show main features)

- [ ] `main-interface.png` — Hero image showing the full app interface
- [ ] `chat-streaming.png` — Active chat with streaming response and token counter
- [ ] `agent-config.png` — Agent configuration dialog open
- [ ] `mcp-import-tabs.png` — MCP import dialog showing all three tabs
- [ ] `tool-call-block.png` — Expanded tool call showing parameters and results

## Priority: High (Core functionality)

- [ ] `dashboard-empty.png` — Empty state with onboarding/feature highlights
- [ ] `agent-list.png` — Sidebar showing multiple agents
- [ ] `memory-panel.png` — Memory panel with usage highlights
- [ ] `global-search.png` — Cmd+K search dialog with results
- [ ] `deep-research.png` — Research progress panel in action

## Priority: Medium (Additional features)

- [ ] `reasoning-blocks.png` — Chat showing collapsible reasoning blocks
- [ ] `mcp-presets.png` — MCP presets dialog
- [ ] `mcp-servers.png` — MCP servers list with connection status
- [ ] `settings-tabs.png` — Settings dialog showing tabs
- [ ] `shortcuts.png` — Keyboard shortcuts dialog (press ?)

## Priority: Low (Nice to have)

- [ ] `research-stages.png` — Deep research stages breakdown
- [ ] `research-sources.png` — Research sources panel
- [ ] `theme-toggle.png` — Side-by-side dark/light theme comparison
- [ ] `agent-settings.png` — Detailed agent settings view
- [ ] `tool-execution.png` — Multiple tool calls in sequence

## Screenshot Tips

### Setup
1. Use a clean database or create sample data
2. Use example agents like "Research Assistant", "Code Helper", etc.
3. Use safe example content (no real API keys or personal data)
4. Consider both dark and light themes

### Capture Guidelines
1. **Resolution**: Full HD (1920x1080) minimum
2. **Window size**: Maximize or use consistent size
3. **Content**: Show realistic usage scenarios
4. **Clean UI**: No error states unless demonstrating error handling
5. **Focus**: Each screenshot should demonstrate one clear feature

### Specific Shots

#### main-interface.png
- Show full app with sidebar, chat area, and a recent message
- Agent selected with visible conversation
- Clean, professional appearance

#### chat-streaming.png
- Active streaming response (you can pause mid-stream)
- Show token counter at bottom
- Show "Generating..." indicator

#### agent-config.png
- Agent dialog open showing:
  - Provider dropdown (e.g., OpenAI)
  - Model selection (e.g., gpt-4o)
  - System prompt field
  - Tools section visible

#### mcp-import-tabs.png
- MCP import dialog open
- Show all three tabs visible: "From File", "From URL", "Install via npx"
- Preferably on the "Install via npx" tab with an example command

#### tool-call-block.png
- Expanded tool call block showing:
  - Tool name and icon
  - Parameters section
  - Result section
  - Status badge (complete/calling/error)

#### deep-research.png
- Research progress panel visible (slide up from bottom)
- Show multiple stages (planning, searching, fetching, etc.)
- Show sources being discovered

#### memory-panel.png
- Memory panel open on right side
- Show several memories listed
- Highlight recently-used memories (they should have different styling)
- Show usage count badge

#### global-search.png
- Cmd+K dialog open
- Search results showing multiple messages
- Highlighted search terms in results
- Show filter buttons (Today, This week, etc.)

## Post-Processing

After capturing:

1. **Crop**: Remove unnecessary chrome/space
2. **Compress**: Use ImageOptim, TinyPNG, or similar
3. **Target size**: Under 500KB per image
4. **Verify**: Check image looks good at different sizes
5. **Name correctly**: Use exact filename from checklist

## Adding to README

Images are already referenced in README.md at:
```markdown
![Description](./docs/images/filename.png)
```

Just add the files to `/docs/images/` directory.

## Testing

After adding images, verify:
```bash
# Check all images exist
ls -lh docs/images/*.png

# Check total size isn't too large
du -sh docs/images/

# Preview README in GitHub or VS Code
```

## Example Commands

```bash
# Optimize PNG images (macOS)
imageoptim docs/images/*.png

# Using pngquant (cross-platform)
pngquant --quality=65-80 docs/images/*.png --ext .png --force

# Check which images are still missing
cd docs/images && ls *.png
```
