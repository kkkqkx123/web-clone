import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ConvertResult } from '../types.js';

export function assembleConvert(result: ConvertResult, options: any): ConvertResult {
  const outputDir = options.output;

  try {
    mkdirSync(outputDir, { recursive: true });

    // Write components
    const componentDir = join(outputDir, 'components');
    mkdirSync(componentDir, { recursive: true });

    // Collect low-confidence components for review
    const lowConfidenceComponents: any[] = [];

    result.components.forEach((comp) => {
      const compDir = join(componentDir, comp.name);
      mkdirSync(compDir, { recursive: true });

      writeFileSync(join(compDir, 'template.html'), comp.template);
      writeFileSync(join(compDir, 'style.css'), comp.styles || '');

      if (comp.logic?.state || comp.logic?.methods) {
        const logicContent = JSON.stringify(comp.logic, null, 2);
        writeFileSync(join(compDir, 'logic.original.json'), logicContent);
      }

      writeFileSync(join(compDir, 'manifest.json'), JSON.stringify(comp.manifest, null, 2));

      // Track low-confidence matches
      if ((comp.matchConfidence ?? 0) < 0.6) {
        lowConfidenceComponents.push({
          name: comp.name,
          confidence: Math.round((comp.matchConfidence ?? 0) * 100),
          type: comp.type,
          reason: (comp.matchConfidence ?? 0) < 0.3 ? 'Very low confidence - strong manual review recommended' : 'Low confidence - manual review suggested'
        });
      }
    });

    // Write global styles if available
    writeGlobalStyles(result, outputDir);

    // Write global files
    writeFileSync(join(outputDir, 'index.json'), JSON.stringify(result.index, null, 2));
    writeFileSync(join(outputDir, 'README.md'), generateReadme(result));
    writeFileSync(join(outputDir, 'MIGRATION.md'), generateMigrationGuide(result));

    // Write low-confidence report if needed
    if (lowConfidenceComponents.length > 0) {
      writeFileSync(
        join(outputDir, 'REVIEW_REQUIRED.md'),
        generateReviewReport(lowConfidenceComponents)
      );
    }

    console.log(`\n  ✓ Conversion complete`);
    console.log(`    Components: ${result.components.size}`);
    if (result.index?.stats) {
      console.log(`    Stateful:   ${result.index.stats.stateful}`);
      console.log(`    Presentational: ${result.index.stats.presentational}`);
    }
    if (lowConfidenceComponents.length > 0) {
      console.log(`    ⚠️  Low confidence: ${lowConfidenceComponents.length} (see REVIEW_REQUIRED.md)`);
    }
  } catch (err: any) {
    console.error(`Failed to write output: ${err.message}`);
    throw err;
  }

  return result;
}

function writeGlobalStyles(result: ConvertResult, outputDir: string): void {
  const stylesDir = join(outputDir, 'styles');
  const index = result.index as any;

  // Only create styles directory if we have style-related info
  if (!index?.globalStyles && (!index?.globalRules || index.globalRules.length === 0)) {
    return;
  }

  mkdirSync(stylesDir, { recursive: true });

  // Generate variables.css from CSS variables
  if (index?.globalStyles && Object.keys(index.globalStyles).length > 0) {
    const cssVariables = Object.entries(index.globalStyles)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    const variablesContent = `:root {\n${cssVariables}\n}\n`;
    writeFileSync(join(stylesDir, 'variables.css'), variablesContent);
  }

  // Write reset.css placeholder
  const resetContent = `/* Global CSS Reset */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;
  writeFileSync(join(stylesDir, 'reset.css'), resetContent);

  // Write global.css with collected global rules
  if (index?.globalRules && Array.isArray(index.globalRules) && index.globalRules.length > 0) {
    const globalContent = index.globalRules.join('\n\n');
    writeFileSync(join(stylesDir, 'global.css'), globalContent);
  }
}

function generateReadme(result: ConvertResult): string {
  const components = Array.from(result.components.values());

  return `# Component Structure

Generated from: ${result.sourceUrl}
Generated at: ${result.timestamp}

## Summary

- **Total Components**: ${components.length}
- **Stateful**: ${components.filter(c => c.type === 'stateful').length}
- **Presentational**: ${components.filter(c => c.type === 'presentational').length}

## Components

${components.map(c => {
    return `### ${c.name}

- **Type**: ${c.type}
- **Path**: \`components/${c.name}/\`
- **Files**:
  - \`template.html\` - Component template
  - \`style.css\` - Component styles
  - \`manifest.json\` - Component metadata
${c.logic ? `  - \`logic.original.json\` - Original logic` : ''}

**Effort**: ${c.manifest.migration.effort}
**Priority**: ${c.manifest.migration.priority}

${c.manifest.migration.suggestions.length > 0 ? `**Suggestions**:
${c.manifest.migration.suggestions.map(s => `- ${s}`).join('\n')}` : ''}
`;
  }).join('\n')}
`;
}

function generateMigrationGuide(result: ConvertResult): string {
  const components = Array.from(result.components.values());
  const highPriority = components.filter(c => c.manifest.migration.priority === 'high');

  return `# Migration Guide

## Quick Start

1. Start with high-priority components
2. Follow the suggestions in each component's \`manifest.json\`
3. Check \`logic.original.json\` for state and methods that need conversion

## High Priority Components

${highPriority.map(c => `- **${c.name}** (${c.manifest.migration.effort})`).join('\n')}

## Common Patterns

### Converting State Variables

Look at \`components/{Name}/logic.original.json\` for identified state variables and convert them to your framework's reactive system.

### Mapping Event Handlers

Review the \`events\` section in each component's manifest to map event listeners to component methods.

### CSS Migration

Check \`components/{Name}/style.css\` for component-specific styles and integrate them into your framework.

## Next Steps

1. Review each component's manifest.json for TODOs
2. Convert identified state variables to framework-specific reactive references
3. Map event handlers to component methods
4. Test component interactions

---

**Note**: This migration guide is generated automatically. Manual review is recommended for optimal results.
`;
}

function generateReviewReport(lowConfidenceComponents: any[]): string {
  return `# Components Requiring Manual Review

⚠️ **The following components have low extraction confidence and should be manually verified.**

Generated: ${new Date().toISOString()}

## Summary

- **Total components requiring review**: ${lowConfidenceComponents.length}
- **Very low confidence** (< 30%): ${lowConfidenceComponents.filter(c => c.confidence < 30).length}
- **Low confidence** (30-60%): ${lowConfidenceComponents.filter(c => c.confidence >= 30).length}

## Components

${lowConfidenceComponents.sort((a, b) => a.confidence - b.confidence).map(comp => `
### ${comp.name}

- **Confidence**: ${comp.confidence}%
- **Type**: ${comp.type}
- **Reason**: ${comp.reason}
- **Action**: Open \`components/${comp.name}/manifest.json\` and verify:
  - [ ] Component boundaries are correctly identified
  - [ ] Associated styles are accurate
  - [ ] State variables and events are properly extracted
  - [ ] Update template.html if needed
  - [ ] Adjust manifest.json with correct metadata

---
`).join('')}

## Recommendations

1. **Sort by confidence**: Start with highest confidence components first
2. **Verify boundaries**: Check if component template contains all necessary HTML
3. **Review styles**: Ensure all CSS rules for the component are included
4. **Cross-reference**: Compare with manifest.json's state/events/suggestions
5. **Manual corrections**: Edit template.html and manifest.json as needed

## How to Proceed

1. Review each component in order (highest confidence first)
2. If a component's boundaries are wrong, edit the \`template.html\`
3. If styles are missing/incorrect, update \`style.css\`
4. Run your migration process after all reviews are complete

---

**Note**: This file is auto-generated. Manual verification is essential for high-quality results.
`;
}
