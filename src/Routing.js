import './style.scss';

import 'babel-polyfill';
import React from 'react';
import {render} from 'react-dom';
import { Router, Route, hashHistory, IndexRoute } from 'react-router';

import Application from './sections/Application';
import Content from './sections/content/Content';
import NoContent from './sections/content/NoContent';
import Console from './sections/console/Console';


render((
    <Router history={hashHistory}>
        <Route path="/" component={Application} >
            <IndexRoute component={Console} />
        </Route>
    </Router>
), document.getElementById('root'));
