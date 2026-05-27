<script setup lang="ts"></script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade-slide" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>
