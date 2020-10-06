FROM maven:latest as mvn-builder

WORKDIR /usr/src/app
COPY preprocessing .
RUN mvn clean package assembly:single


FROM mozilla/sbt:8u232_1.3.13 as sbt-builder
RUN mkdir -p /usr/src/ui
WORKDIR /usr/src/ui
COPY --from=mvn-builder /usr/src/app ./preprocessing
COPY build.sbt .
COPY project ./project
COPY app ./app
COPY conf ./conf
RUN apt-get update && apt-get install make
RUN sbt dist 
RUN unzip target/universal/newsleak-ui.zip -d target/universal/

FROM openjdk:11.0.2-jdk-slim-stretch

RUN apt-get update && apt-get install -y \
  curl \
  apt-transport-https \
  gnupg

RUN groupadd -g 999 newsleak && useradd -r -u 999 -g newsleak newsleak

RUN mkdir -p /opt/newsleak
RUN chown newsleak:newsleak /opt/newsleak

WORKDIR /opt/newsleak

COPY --from=sbt-builder /usr/src/ui/target/universal/newsleak-ui .
RUN rm conf/*.conf
ADD conf/application.production.conf conf/

COPY --from=sbt-builder /usr/src/ui/preprocessing/target/preprocessing-jar-with-dependencies.jar preprocessing.jar
COPY --from=sbt-builder /usr/src/ui/preprocessing/conf/dictionaries conf/dictionaries/
COPY --from=sbt-builder /usr/src/ui/preprocessing/conf/newsleak.properties conf/
COPY --from=sbt-builder /usr/src/ui/preprocessing/data/document_example.csv data/document_example.csv
COPY --from=sbt-builder /usr/src/ui/preprocessing/data/metadata_example.csv data/metadata_example.csv
COPY --from=sbt-builder /usr/src/ui/preprocessing/resources resources/
COPY --from=sbt-builder /usr/src/ui/preprocessing/desc desc/

RUN chown newsleak:newsleak /opt/newsleak/data

ADD newsleak-start.sh .

# USER newsleak, line uncommented so that the user at the end of the entrypoint is still root and can change the permission of the folders which are created by the docker daemon

EXPOSE 9000

CMD ./newsleak-start.sh
