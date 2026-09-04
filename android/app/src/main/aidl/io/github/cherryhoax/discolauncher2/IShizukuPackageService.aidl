package io.github.cherryhoax.discolauncher2;

interface IShizukuPackageService {
    void destroy() = 16777114;
    boolean uninstall(String packageName, int userId) = 1;
}
