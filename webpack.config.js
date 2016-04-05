const path = require('path');
const webpack = require('webpack');
const webpackTargetElectronRenderer = require('webpack-target-electron-renderer');


var config = {
    devtool: 'cheap-module-eval-source-map',
    entry: [
        path.join(__dirname, 'app', 'src', 'Routing.js')
    ],
    output: {
        path: path.join(__dirname, 'app', 'dist'),
        filename: "bundle.js"
    },
    module: {
        loaders: [
            {
                test: /\.scss$|\.css$/,
                loader: "style-loader!css-loader!postcss-loader"
            },
            {
                test: /\.jsx?$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel'
            }
        ]
    },
    plugins: [
        new webpack.optimize.OccurenceOrderPlugin(),
        new webpack.NoErrorsPlugin()
    ],
    postcss: function () {
        return [
            require('precss'),
            require('autoprefixer')
        ];
    }

};
config.target = webpackTargetElectronRenderer(config);

module.exports = config;