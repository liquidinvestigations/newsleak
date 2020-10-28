#!/bin/bash
cd /opt/newsleak
rm -f RUNNING_PID
cp -n -r conf /etc/settings/
cp -n -r data /etc/settings/
cp /local/conf /etc/settings/conf/newsleak.properties
cp /local/application.production.conf /etc/settings/conf/application.production.conf
chown newsleak:newsleak -R /etc/settings/
gosu  newsleak /bin/sh -c 'bin/newsleak -Dconfig.file=/etc/settings/conf/application.production.conf'
