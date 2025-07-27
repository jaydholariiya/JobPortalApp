import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const token = localStorage.getItem('token');

    const currentRoute = router.url;

    const publicRoutes = ['/login', '/register'];
    const isPublicRoute = publicRoutes.some(route => currentRoute.includes(route));

    if (isPublicRoute) {
        return next(req);
    }

    if (!token) {
        router.navigate(['/login']);
        return next(req);
    }

    const authReq = req.clone({
        setHeaders: {
            Authorization: `Bearer ${token}`
        }
    });

    return next(authReq);
};
