FROM alpine:3.23

RUN apk add --no-cache squid python3 \
    && addgroup -g 10500 awg-proxy \
    && adduser -D -H -u 10500 -G awg-proxy awg-proxy
COPY squid.conf /etc/squid/squid.conf
COPY auth.py /usr/local/bin/awg-proxy-auth
RUN chmod 0755 /usr/local/bin/awg-proxy-auth

USER 10500:10500
CMD ["/usr/local/bin/awg-proxy-auth", "--start"]
