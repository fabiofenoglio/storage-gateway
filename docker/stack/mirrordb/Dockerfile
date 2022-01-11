FROM mysql:5.7 as mysql-builder-doc

ARG SOURCE_HOST_SG_DOC
ARG SOURCE_DATABASE_SG_DOC
ARG SOURCE_USER_SG_DOC
ARG SOURCE_PASSWORD_SG_DOC

ENV MYSQL_ROOT_PASSWORD=storage-gateway
ENV MYSQL_DATABASE=storage-gateway
ENV MYSQL_USER=storage-gateway
ENV MYSQL_PASSWORD=storage-gateway

# That file does the DB initialization but also runs mysql daemon, by removing the last line it will only init
RUN ["sed", "-i", "s/exec \"$@\"/echo \"not running $@\"/", "/usr/local/bin/docker-entrypoint.sh"]

ADD init /docker-entrypoint-initdb.d/

# Dump remote database
RUN mysqldump --routines --add-drop-table --skip-extended-insert --no-tablespaces \
    -u $SOURCE_USER_SG_DOC -p"$SOURCE_PASSWORD_SG_DOC" --host=$SOURCE_HOST_SG_DOC --port=3306 --databases $SOURCE_DATABASE_SG_DOC > /docker-entrypoint-initdb.d/520-import-remote-dump-sg-doc.sql

# Need to change the datadir to something else that /var/lib/mysql because the parent docker file defines it as a volume.
# https://docs.docker.com/engine/reference/builder/#volume :
#       Changing the volume from within the Dockerfile: If any build steps change the data within the volume after
#       it has been declared, those changes will be discarded.
RUN ["/usr/local/bin/docker-entrypoint.sh", "mysqld", "--datadir", "/initialized-db"]

FROM mysql:5.7
COPY --from=mysql-builder-doc /initialized-db /var/lib/mysql
