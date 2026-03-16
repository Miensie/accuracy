const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path              = require("path");

// Nom du repo GitHub — à adapter si différent
const REPO_NAME = process.env.REPO_NAME || "accuracy-profile-addin";
// En prod (GitHub Pages) : publicPath = /nom-du-repo/
// En dev (localhost)     : publicPath = /
const isProd      = process.env.NODE_ENV === "production";
const publicPath  = isProd ? `/${REPO_NAME}/` : "/";

module.exports = {
  entry: {
    taskpane: "./src/taskpane/taskpane.js",
    commands: "./src/commands/commands.js",
  },
  output: {
    path:       path.resolve(__dirname, "dist"),
    filename:   "[name].js",
    publicPath,
    clean: true,
  },
  resolve: { extensions: [".js"] },
  module: {
    rules: [
      { test: /\.js$/,  use: "babel-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.(png|svg|ico)$/, type: "asset/resource" },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "taskpane.html",
      template: "./src/taskpane/taskpane.html",
      chunks:   ["taskpane"],
    }),
    new HtmlWebpackPlugin({
      filename: "commands.html",
      template: "./src/taskpane/commands.html",
      chunks:   ["commands"],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "manifest.xml", to: "manifest.xml" },
      ],
    }),
  ],
  devServer: {
    port: 3000, hot: true,
    headers: { "Access-Control-Allow-Origin": "*" },
    server: {
      type: "https",
      options: {
        ca:   `${process.env.USERPROFILE}/.office-addin-dev-certs/ca.crt`,
        key:  `${process.env.USERPROFILE}/.office-addin-dev-certs/localhost.key`,
        cert: `${process.env.USERPROFILE}/.office-addin-dev-certs/localhost.crt`,
      },
    },
  },
};
