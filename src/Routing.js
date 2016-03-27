import './style.scss';

import 'babel-polyfill';
import React from 'react';
import {render} from 'react-dom';
import { Router, Route, hashHistory, IndexRoute } from 'react-router';

import Application from './sections/Application';
import Content from './sections/content/Content';
import NoContent from './sections/content/NoContent';
import Commands from './sections/results/Commands';


render((
    <Router history={hashHistory}>
        <Route path="/" component={Application} >
            <IndexRoute component={Commands} />
        </Route>
    </Router>
), document.getElementById('root'));
