import './style.scss';

import 'babel-polyfill';
import React from 'react';
import {render} from 'react-dom';
import { Router, Route, hashHistory, IndexRoute } from 'react-router';

import Application from './components/Application';
import Console from './components/console/Console';


render((
    <Router history={hashHistory}>
        <Route path="/" component={Application} >
            <IndexRoute component={Console} />
        </Route>
    </Router>
), document.getElementById('root'));
