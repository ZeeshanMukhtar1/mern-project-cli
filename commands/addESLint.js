import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import readline from 'readline';
import { detectProjectType } from '../utils/detectProjectType.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const promptOverwrite = (message) => {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (y/n): `), (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
};

// Configuration generators
const getESLintConfig = (projectType, isBackend = false) => {
  const baseConfig = {
    env: {
      browser: !isBackend,
      node: isBackend,
      es2021: true,
      jest: true,
    },
    extends: ['eslint:recommended', 'plugin:prettier/recommended'],
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': isBackend ? 'off' : 'warn',
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 80,
          tabWidth: 2,
        },
      ],
    },
  };

  // Project-specific configurations
  switch (projectType) {
    case 'react':
      return {
        ...baseConfig,
        extends: [
          ...baseConfig.extends,
          'plugin:react/recommended',
          'plugin:react-hooks/recommended',
        ],
        plugins: ['react', 'react-hooks'],
        settings: {
          react: {
            version: 'detect',
          },
        },
        rules: {
          ...baseConfig.rules,
          'react/prop-types': 'warn',
          'react-hooks/rules-of-hooks': 'error',
          'react-hooks/exhaustive-deps': 'warn',
        },
      };

    case 'vue':
      return {
        ...baseConfig,
        extends: [...baseConfig.extends, 'plugin:vue/vue3-recommended'],
        plugins: ['vue'],
        rules: {
          ...baseConfig.rules,
          'vue/multi-word-component-names': 'warn',
        },
      };

    case 'typescript':
      return {
        ...baseConfig,
        extends: [
          ...baseConfig.extends,
          'plugin:@typescript-eslint/recommended',
        ],
        parser: '@typescript-eslint/parser',
        plugins: ['@typescript-eslint'],
        rules: {
          ...baseConfig.rules,
          '@typescript-eslint/no-explicit-any': 'warn',
          '@typescript-eslint/explicit-function-return-type': 'warn',
        },
      };

    case 'node':
      return {
        ...baseConfig,
        rules: {
          ...baseConfig.rules,
          'no-process-env': 'warn',
          'no-sync': 'warn',
        },
      };

    default:
      return baseConfig;
  }
};

const getDependencies = (projectType, isBackend = false) => {
  const baseDependencies = [
    'eslint',
    'prettier',
    'eslint-config-prettier',
    'eslint-plugin-prettier',
  ];

  // Add backend-specific dependencies
  if (isBackend) {
    baseDependencies.push('eslint-plugin-node');
  }

  const projectDependencies = {
    react: ['eslint-plugin-react', 'eslint-plugin-react-hooks'],
    vue: ['eslint-plugin-vue'],
    typescript: [
      '@typescript-eslint/parser',
      '@typescript-eslint/eslint-plugin',
    ],
    // we Remove node from projectDependencies since it's handled above , based on isBackend flag
  };

  return [...baseDependencies, ...(projectDependencies[projectType] || [])];
};

// Main setup function
const setupESLint = async (dirPath) => {
  try {
    // Ensure directory exists
    await fs.ensureDir(dirPath);

    // Detect project type
    const projectType = detectProjectType(dirPath);
    const isBackend = dirPath.includes('backend');
    console.log(chalk.cyan(`📝 Detected project type: ${projectType}`));

    // Generate and write ESLint config
    const eslintConfig = getESLintConfig(projectType, isBackend);
    const eslintConfigPath = path.join(dirPath, '.eslintrc.json');

    if (fs.existsSync(eslintConfigPath)) {
      const overwrite = await promptOverwrite(
        `.eslintrc.json exists in ${dirPath}. Overwrite?`
      );
      if (!overwrite) {
        console.log(chalk.yellow('⚠️ Skipping .eslintrc.json creation.'));
        return;
      }
    }

    await fs.writeJSON(eslintConfigPath, eslintConfig, { spaces: 2 });
    console.log(chalk.green(`✅ ESLint config written to ${eslintConfigPath}`));

    // Create .prettierrc
    const prettierConfigPath = path.join(dirPath, '.prettierrc');

    if (fs.existsSync(prettierConfigPath)) {
      const overwrite = await promptOverwrite(
        `.prettierrc exists in ${dirPath}. Overwrite?`
      );
      if (!overwrite) {
        console.log(chalk.yellow('⚠️ Skipping .prettierrc creation.'));
        return;
      }
    }

    const prettierConfig = {
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 80,
      tabWidth: 2,
    };
    await fs.writeJSON(prettierConfigPath, prettierConfig, { spaces: 2 });
    console.log(
      chalk.green(`✅ Prettier config written to ${prettierConfigPath}`)
    );

    const packageJsonPath = path.join(dirPath, 'package.json');
    const packageJson = fs.existsSync(packageJsonPath)
      ? await fs.readJSON(packageJsonPath)
      : { scripts: {} };

    packageJson.scripts = {
      ...packageJson.scripts,
      lint: 'eslint . --ext .js,.jsx,.ts,.tsx,.vue',
      'lint:fix': 'eslint . --ext .js,.jsx,.ts,.tsx,.vue --fix',
      format: 'prettier --write "**/*.{js,jsx,ts,tsx,vue,json,css,scss,md}"',
    };

    await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.green(`✅ Scripts added to ${packageJsonPath}`));

    const dependencies = getDependencies(projectType, isBackend);
    console.log(chalk.cyan('📦 Installing dependencies...'));
    execSync(`npm install ${dependencies.join(' ')} --save-dev`, {
      stdio: 'inherit',
      cwd: dirPath,
    });

    // Create .eslintignore
    const eslintIgnorePath = path.join(dirPath, '.eslintignore');
    const eslintIgnore = [
      'node_modules',
      'build',
      'dist',
      'coverage',
      '*.min.js',
      '*.config.js',
    ].join('\n');

    if (
      !fs.existsSync(eslintIgnorePath) ||
      (await promptOverwrite('.eslintignore exists. Overwrite?'))
    ) {
      await fs.writeFile(eslintIgnorePath, eslintIgnore);
      console.log(chalk.green(`✅ Created ${eslintIgnorePath}`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Setup failed: ${error.message}`));
    return false;
  } finally {
    rl.close();
  }
};

// CLI command registration
export default function addESLintCommand(program) {
  program
    .command('add-eslint [directory]')
    .description('Initialize ESLint and Prettier in the specified directory')
    .option('-f, --force', 'Force installation even if configs exist')
    .option('-s, --skip-install', 'Skip dependency installation')

    .action(async (directory = '.', options) => {
      const dirs = ['frontend', 'backend']
        .map((dir) => path.join(directory, dir))
        .filter((dir) => fs.existsSync(dir));

      if (dirs.length === 0) {
        dirs.push(directory);
      }

      console.log(chalk.cyan(`🚀 Setting up ESLint in: ${dirs.join(', ')}`));

      for (const dir of dirs) {
        const configExists = fs.existsSync(path.join(dir, '.eslintrc.json'));
        if (configExists && !options.force) {
          console.log(
            chalk.yellow(
              `⚠️ ESLint config already exists in ${dir}. Use --force to override.`
            )
          );
          continue;
        }

        await setupESLint(dir);
      }

      console.log(chalk.green('✨ ESLint setup complete!'));
    });
}
