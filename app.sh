#!/bin/bash
killall Xvfb
xvfb-run -s "-ac -screen 0 1024x1024x24" node server