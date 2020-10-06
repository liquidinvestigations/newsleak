#!/bin/bash
cd /opt/newsleak
rm -f RUNNING_PID
cp -n -r conf /etc/settings/
cp -n -r data /etc/settings/
chown newsleak:newsleak -R /etc/settings/
sudo -u newsleak export NEWSLEAK_CONFIG=/etc/settings/conf/application.production.conf
sudo -u newsleak bin/newsleak -Dconfig.file=/etc/settings/conf/application.production.conf
