FROM maven:latest as mvn-builder

RUN mkdir -p usr/src/ui
WORKDIR /usr/src/ui
COPY . .
WORKDIR /usr/src/ui/preprocessing
RUN mvn clean package assembly:single


FROM mozilla/sbt:8u232_1.3.13 as sbt-builder

RUN mkdir -p /usr/src/ui
RUN chown 999:999 /usr/src/ui
# Directory is needed in order for npm install to run
RUN mkdir -p /home/sbt
RUN chown 999:999 /home/sbt
WORKDIR /usr/src/ui
COPY --from=mvn-builder --chown=999:999 /usr/src/ui .
RUN apt-get update
RUN apt-get -y install curl gnupg
RUN apt-get update && apt-get install make
RUN curl -sL https://deb.nodesource.com/setup_15.x  | bash -
RUN apt-get -y install nodejs
USER 999
RUN npm install
RUN sbt dist
RUN unzip target/universal/newsleak-ui.zip -d target/universal/

FROM openjdk:11.0.2-jdk-slim-stretch

RUN groupadd -g 999 newsleak && useradd -r -u 999 -g newsleak newsleak
RUN apt-get update && apt-get install -y \
  curl \
  apt-transport-https \
  gnupg

RUN set -eux; \
	apt-get install -y gosu; \
	rm -rf /var/lib/apt/lists/*; \
# verify that the binary works
	gosu nobody true

RUN mkdir -p /opt/newsleak
RUN chown newsleak:newsleak /opt/newsleak

WORKDIR /opt/newsleak

COPY --from=sbt-builder --chown=999:999 /usr/src/ui/target/universal/newsleak-ui .
RUN rm conf/*.conf
ADD --chown=999:999 conf/application.production.conf conf/

COPY --from=sbt-builder --chown=999:999  /usr/src/ui/preprocessing/target/preprocessing-jar-with-dependencies.jar preprocessing.jar
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/conf/dictionaries conf/dictionaries/
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/conf/newsleak.properties conf/
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/data/document_example.csv data/document_example.csv
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/data/metadata_example.csv data/metadata_example.csv
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/resources resources/
COPY --from=sbt-builder --chown=999:999 /usr/src/ui/preprocessing/desc desc/

RUN chown newsleak:newsleak /opt/newsleak/data

ADD newsleak-start.sh .

ENV NEWSLEAK_CONFIG=/etc/settings/conf/application.production.conf

EXPOSE 9000

CMD ./newsleak-start.sh
