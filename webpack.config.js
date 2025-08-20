import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'production',
  entry: {
    'category-editor': './src/category-editor.js',
    'ckeditor5-styles': './src/ckeditor5-styles.css'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    library: {
      type: 'umd',
      name: 'CategoryEditor'
    },
    globalObject: 'this',
    clean: true // Clean dist folder before each build
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules(?!\/ckeditor5)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  chrome: "88"
                }
              }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new CopyWebpackPlugin({
      patterns: [
        // Copy all extension files to dist
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'api.js', to: 'api.js' },
        { from: 'content.js', to: 'content.js' },
        { from: 'background.js', to: 'background.js' },
        { from: 'options.html', to: 'options.html' },
        { from: 'options.js', to: 'options.js' },
        { from: 'styles.css', to: 'styles.css' },
        { from: 'web_accessible.js', to: 'web_accessible.js' },
        { from: 'LICENSE', to: 'LICENSE' },
        { from: 'README.md', to: 'README.md' },
        
        // Copy icon files
        { from: 'dd-16.png', to: 'dd-16.png' },
        { from: 'dd-32.png', to: 'dd-32.png' },
        { from: 'dd-48.png', to: 'dd-48.png' },
        { from: 'dd-128.png', to: 'dd-128.png' },
        { from: 'dd.svg', to: 'dd.svg' },
        
        // Copy localization files
        { from: '_locales', to: '_locales' }
      ]
    }),
    // Remove empty JS files generated for CSS-only entries
    {
      apply: (compiler) => {
        compiler.hooks.emit.tap('RemoveEmptyJSFiles', (compilation) => {
          delete compilation.assets['ckeditor5-styles.js'];
        });
      }
    }
  ],
  resolve: {
    extensions: ['.js']
  },
  optimization: {
    minimize: false // Keep readable for debugging
  }
};
