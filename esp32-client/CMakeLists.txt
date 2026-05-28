cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(homeguard_esp32_client)

idf_build_set_property(COMPILE_DEFINITIONS "DNS_LOCAL_HOSTLIST=1" APPEND)
idf_build_set_property(COMPILE_DEFINITIONS "DNS_LOCAL_HOSTLIST_IS_DYNAMIC=1" APPEND)
